import { db } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { isSyncDisabledForActiveMerchant } from './queue'

/**
 * Pulls one outlet's orders, order lines, and payments for a single local
 * calendar day down from Supabase into Dexie. Reports (CLAUDE.md section 10
 * Phase 4) read only from Dexie, and the sync queue only ever pushes
 * device -> cloud (see pullMerchantData.ts's "historical orders/payments
 * aren't pulled" note) — so without this, a report viewed on a device that
 * didn't take the order itself (e.g. the owner's laptop, or a reset tablet)
 * would show it as missing even though it was paid and synced fine.
 *
 * Basic-plan merchants never push orders to Supabase in the first place
 * (queue.ts's isSyncDisabledForActiveMerchant gate), so there's nothing to
 * pull for them.
 */
export async function pullOrdersForDate(outletId: string, date: Date): Promise<void> {
  if (await isSyncDisabledForActiveMerchant()) return

  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select()
    .eq('outlet_id', outletId)
    .gte('created_at', dayStart.toISOString())
    .lt('created_at', dayEnd.toISOString())
  if (ordersError) throw ordersError
  if (!orders?.length) return

  await db.orders.bulkPut(orders)

  const orderIds = orders.map((order) => order.id)
  const [linesRes, paymentsRes] = await Promise.all([
    supabase.from('order_lines').select().in('order_id', orderIds),
    supabase.from('payments').select().in('order_id', orderIds),
  ])
  if (linesRes.error) throw linesRes.error
  if (paymentsRes.error) throw paymentsRes.error

  if (linesRes.data?.length) await db.order_lines.bulkPut(linesRes.data)
  if (paymentsRes.data?.length) await db.payments.bulkPut(paymentsRes.data)
}
