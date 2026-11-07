import { db } from '../../lib/db'
import { getActiveMerchantId } from '../../lib/localSession'
import { nextSeq } from '../../lib/sequence'
import { supabase } from '../../lib/supabase'
import type { SyncOp, SyncQueueItem } from '../../lib/types'
import { reassignDeviceReceiptPrefix } from './deviceConflictResolution'

type QueueChangedListener = () => void
const queueChangedListeners = new Set<QueueChangedListener>()

/** The sync manager subscribes to this so a new item can trigger an immediate drain attempt. */
export function onQueueChanged(listener: QueueChangedListener): () => void {
  queueChangedListeners.add(listener)
  return () => queueChangedListeners.delete(listener)
}

/**
 * Basic-plan merchants are device-only and must never sync to Supabase. No
 * active merchant yet (e.g. mid-onboarding, before sign-up finishes) is not
 * treated as Basic — there's nothing to gate against yet.
 */
export async function isSyncDisabledForActiveMerchant(): Promise<boolean> {
  const merchantId = getActiveMerchantId()
  if (!merchantId) return false
  const merchant = await db.merchants.get(merchantId)
  return merchant?.plan === 'basic'
}

/**
 * Enqueues a pending push to Supabase. Call this AFTER the corresponding
 * Dexie write — every action writes to Dexie first (CLAUDE.md section 8),
 * and this queue is what eventually pushes it to the cloud. A no-op for
 * Basic-plan merchants, so sync_queue never grows for a device that will
 * never drain it.
 */
export async function enqueue(table: string, op: SyncOp, payload: Record<string, unknown>) {
  if (await isSyncDisabledForActiveMerchant()) return

  const item: SyncQueueItem = {
    id: crypto.randomUUID(),
    table,
    op,
    payload,
    created_at: new Date().toISOString(),
    seq: nextSeq(),
    attempts: 0,
    last_error: null,
  }
  await db.sync_queue.add(item)
  for (const listener of queueChangedListeners) listener()
}

export async function getPendingCount(): Promise<number> {
  return db.sync_queue.count()
}

/** Pure: builds and sends the one Supabase call for a queue item. Throws on failure. */
export async function pushOne(item: SyncQueueItem): Promise<void> {
  if (item.op === 'upsert') {
    const { error } = await supabase.from(item.table).upsert(item.payload)
    if (error) throw error
    return
  }

  let query = supabase.from(item.table).delete()
  for (const [column, value] of Object.entries(item.payload)) {
    query = query.eq(column, value)
  }
  const { error } = await query
  if (error) throw error
}

// Serializes concurrent calls onto the same in-flight attempt. Without
// this, two near-simultaneous callers (e.g. React StrictMode's intentional
// double-invoke of the sync manager's effect in development, or the manager
// racing a manual "sync now" trigger) would both read the queue before
// either deletes anything and both push every item — harmless to data
// (upsert/delete are idempotent) but doubles outbound requests for nothing.
// Same pattern as features/device/api.ts's ensureActiveDevice.
let drainInFlight: Promise<{ pushed: number; remaining: number }> | null = null

/**
 * Supabase/PostgREST errors are plain objects, not Error instances, so
 * `err instanceof Error` is false for them and `String(err)` collapses to
 * the useless "[object Object]" — this pulls out whatever real message is
 * actually there instead.
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

interface PostgrestLikeError {
  code: string
  message?: string
}

/** A PostgREST/Supabase rejection has a string `.code` (the Postgres SQLSTATE); a plain network throw doesn't. */
function asPostgrestError(err: unknown): PostgrestLikeError | null {
  if (typeof err !== 'object' || err === null) return null
  if (!('code' in err) || typeof (err as { code?: unknown }).code !== 'string') return null
  return err as PostgrestLikeError
}

// Postgres SQLSTATEs that mean "this exact write can never succeed as-is" —
// retrying it unchanged just wastes a cycle and, worse, blocks every newer
// item behind it in the queue. 23505 (unique violation) is deliberately
// excluded: on a `devices` upsert it's a receipt-prefix race the queue
// auto-recovers from by re-rolling a free prefix (not a permanent failure),
// and for any other table there's no recovery path yet, so it's safer to
// treat it like a transient failure (stop and retry later) than to silently
// skip an unresolved conflict.
const PERMANENT_ERROR_CODES = new Set([
  '23503', // foreign key violation
  '23502', // not-null violation
  '23514', // check constraint violation
  '22P02', // invalid input syntax (e.g. malformed uuid)
  '42501', // RLS / insufficient privilege
])

type ClassifiedError = 'permanent' | 'transient'

/**
 * Distinguishes "this item's write is permanently bad" from "this attempt
 * failed, probably because we're offline" — drainOnce() uses this to decide
 * whether a failure should block the rest of the batch. Anything without a
 * recognizable PostgREST `.code` (including a plain network-level
 * `TypeError: Failed to fetch`) classifies as transient.
 */
function classifyError(err: unknown): ClassifiedError {
  const pg = asPostgrestError(err)
  if (pg && PERMANENT_ERROR_CODES.has(pg.code)) return 'permanent'
  return 'transient'
}

// After this many failed attempts, an item is treated as permanently stuck
// (e.g. it was queued under an auth session that's since changed, or
// references data that no longer exists) rather than a transient blip —
// see MAX_ATTEMPTS_BEFORE_SKIP's use in drainOnce below.
const MAX_ATTEMPTS_BEFORE_SKIP = 5

/**
 * Pushes every queued item to Supabase, oldest first. A transient failure
 * (classifyError — most likely "we're offline") stops the whole batch there
 * (keeping queue order — section 8's "device's version wins" relies on
 * changes landing in the order they happened), since every later item would
 * probably fail the same way anyway. A permanent failure (this exact write
 * can never succeed, e.g. a foreign key violation against data that no
 * longer exists) never blocks the batch, even on its very first attempt —
 * it stays queued, visibly stuck for later diagnostics, and drainOnce moves
 * straight on to the next item. MAX_ATTEMPTS_BEFORE_SKIP remains a safety
 * valve for a failure that keeps recurring without ever classifying as
 * permanent.
 */
export async function drainOnce(): Promise<{ pushed: number; remaining: number }> {
  if (drainInFlight) return drainInFlight

  drainInFlight = (async () => {
    try {
      const items = await db.sync_queue.orderBy('seq').toArray()
      let pushed = 0

      for (const item of items) {
        try {
          await pushOne(item)
          await db.sync_queue.delete(item.id)
          pushed++
        } catch (err) {
          const pg = asPostgrestError(err)

          // A receipt-prefix race on a devices upsert is auto-recoverable:
          // re-roll this item's prefix to one that's actually free
          // server-side right now and let the normal retry cycle push it
          // again. Not a normal failed attempt, and never blocks the batch.
          if (item.table === 'devices' && item.op === 'upsert' && pg?.code === '23505') {
            try {
              await reassignDeviceReceiptPrefix(item)
            } catch (reassignErr) {
              console.error('sync queue: could not reassign a conflicting receipt_prefix', {
                itemId: item.id,
                reassignErr,
              })
            }
            continue
          }

          const attempts = item.attempts + 1
          const errorType = classifyError(err)
          try {
            await db.sync_queue.update(item.id, {
              attempts,
              last_error: errorMessage(err),
              last_error_type: errorType,
              last_error_code: pg?.code ?? null,
            })
          } catch (recordErr) {
            // Recording the failure is itself a Dexie write and can fail on
            // its own (e.g. a stale IndexedDB connection) — if it throws
            // uncaught here, the ORIGINAL push error (err) never gets
            // recorded and this escapes to the sync manager's outer catch,
            // which just logs and retries forever with no record of why.
            // Swallow it here so the item stays queued for a normal retry
            // next cycle instead of silently wedging the whole loop.
            console.error('sync queue: could not record a failed push', {
              itemId: item.id,
              pushError: err,
              recordError: recordErr,
            })
          }

          if (errorType === 'permanent' || attempts >= MAX_ATTEMPTS_BEFORE_SKIP) continue
          break
        }
      }

      return { pushed, remaining: await getPendingCount() }
    } finally {
      drainInFlight = null
    }
  })()

  return drainInFlight
}
