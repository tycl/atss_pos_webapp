import { db } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import type { SyncQueueItem } from '../../lib/types'

/**
 * Called by queue.ts when an `orders` upsert fails with 23505 on
 * (outlet_id, order_no) — two devices produced the same order number
 * (e.g. both generated offline from the same local count). Queries
 * Supabase for the highest existing order_no for this outlet/date/prefix,
 * assigns the next available number, and updates both the queued payload
 * and the local Dexie order row so the retry cycle can push it again.
 */
export async function reassignOrderNumber(item: SyncQueueItem): Promise<void> {
  const outletId = item.payload.outlet_id as string
  const orderId = item.payload.id as string
  const oldOrderNo = item.payload.order_no as string

  const parts = oldOrderNo.split('-')
  if (parts.length < 3) throw new Error(`Unexpected order_no format: ${oldOrderNo}`)
  const prefix = parts[0]
  const dateStr = parts[1]
  const pattern = `${prefix}-${dateStr}-%`

  const { data, error } = await supabase
    .from('orders')
    .select('order_no')
    .eq('outlet_id', outletId)
    .like('order_no', pattern)

  if (error) throw error

  let maxRunning = 0
  for (const row of data) {
    const rowParts = (row.order_no as string).split('-')
    const running = parseInt(rowParts[rowParts.length - 1], 10)
    if (!isNaN(running) && running > maxRunning) maxRunning = running
  }

  const newRunning = String(maxRunning + 1).padStart(4, '0')
  const newOrderNo = `${prefix}-${dateStr}-${newRunning}`

  await db.sync_queue.update(item.id, {
    payload: { ...item.payload, order_no: newOrderNo },
  })
  await db.orders.update(orderId, { order_no: newOrderNo })
}
