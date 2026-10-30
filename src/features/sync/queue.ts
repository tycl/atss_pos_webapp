import { db } from '../../lib/db'
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
 * Enqueues a pending push to Supabase. Call this AFTER the corresponding
 * Dexie write — every action writes to Dexie first (CLAUDE.md section 8),
 * and this queue is what eventually pushes it to the cloud.
 */
export async function enqueue(table: string, op: SyncOp, payload: Record<string, unknown>) {
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
 * Pushes every queued item to Supabase, oldest first. Stops at the first
 * failure (keeping queue order — section 8's "device's version wins" relies
 * on changes landing in the order they happened) and leaves it in the queue
 * with its attempts/error recorded for the next retry.
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
          await db.sync_queue.update(item.id, {
            attempts: item.attempts + 1,
            last_error: err instanceof Error ? err.message : String(err),
          })
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
