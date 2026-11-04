import { db } from '../../lib/db'
import { getActiveMerchantId } from '../../lib/localSession'
import { nextSeq } from '../../lib/sequence'
import { supabase } from '../../lib/supabase'
import type { SyncOp, SyncQueueItem } from '../../lib/types'

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

// After this many failed attempts, an item is treated as permanently stuck
// (e.g. it was queued under an auth session that's since changed, or
// references data that no longer exists) rather than a transient blip —
// see MAX_ATTEMPTS_BEFORE_SKIP's use in drainOnce below.
const MAX_ATTEMPTS_BEFORE_SKIP = 5

/**
 * Pushes every queued item to Supabase, oldest first. Normally stops at the
 * first failure (keeping queue order — section 8's "device's version wins"
 * relies on changes landing in the order they happened), since a fresh
 * failure is usually just "we're offline" and every later item would fail
 * the same way anyway. But once an item has failed MAX_ATTEMPTS_BEFORE_SKIP
 * times, it's treated as permanently stuck and skipped instead of stopping
 * the batch — it stays in the queue and is still retried on later cycles,
 * it just no longer blocks every other item behind it forever.
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
          const attempts = item.attempts + 1
          try {
            await db.sync_queue.update(item.id, { attempts, last_error: errorMessage(err) })
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

          if (attempts >= MAX_ATTEMPTS_BEFORE_SKIP) continue
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
