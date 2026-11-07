import { db } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import type { SyncQueueItem } from '../../lib/types'

/**
 * Called by queue.ts when a `devices` upsert fails with 23505 on
 * (outlet_id, receipt_prefix) — two offline browsers independently picked
 * the same prefix for the same outlet (features/device/api.ts's
 * nextFreeReceiptPrefix only sees its own local Dexie cache). Re-rolls this
 * item's prefix to one that's actually free server-side right now, updates
 * both the queued payload and the local devices row, and lets the normal
 * retry cycle push it again — never drops the record, per CLAUDE.md
 * section 8.
 */
export async function reassignDeviceReceiptPrefix(item: SyncQueueItem): Promise<void> {
  const outletId = item.payload.outlet_id as string
  const deviceId = item.payload.id as string

  const { data, error } = await supabase
    .from('devices')
    .select('receipt_prefix')
    .eq('outlet_id', outletId)
  if (error) throw error

  const usedPrefixes = new Set(data.map((row) => row.receipt_prefix as string))
  let n = 1
  while (usedPrefixes.has(`D${n}`)) n++
  const newPrefix = `D${n}`

  await db.sync_queue.update(item.id, { payload: { ...item.payload, receipt_prefix: newPrefix } })
  await db.devices.update(deviceId, { receipt_prefix: newPrefix })
}
