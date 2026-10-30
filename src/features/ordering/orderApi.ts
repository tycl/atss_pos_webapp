import { calculateTotals } from '../../lib/calculateTotals'
import { cartLineTotalSen, cartSubtotalSen, type CartLine } from '../../lib/cart'
import { toLocalYYYYMMDD } from '../../lib/date'
import { db } from '../../lib/db'
import type { AuditLog, Order, OrderLine, OrderType, Settings } from '../../lib/types'
import { enqueue } from '../sync/queue'

/** `<device prefix>-<YYYYMMDD>-<running no>`, generated locally (CLAUDE.md section 7). */
export async function generateOrderNo(deviceId: string, devicePrefix: string): Promise<string> {
  const todayStr = toLocalYYYYMMDD(new Date())
  const deviceOrders = await db.orders.where({ device_id: deviceId }).toArray()
  const countToday = deviceOrders.filter(
    (order) => toLocalYYYYMMDD(new Date(order.created_at)) === todayStr,
  ).length
  return `${devicePrefix}-${todayStr}-${countToday + 1}`
}

function linesToOrderLines(merchantId: string, orderId: string, lines: CartLine[]): OrderLine[] {
  return lines.map((line) => ({
    id: crypto.randomUUID(),
    merchant_id: merchantId,
    order_id: orderId,
    item_id: line.itemId,
    name_snapshot: line.name,
    unit_price_sen: line.unitPriceSen,
    qty: line.qty,
    modifiers_snapshot: line.modifiers,
    line_total_sen: cartLineTotalSen(line),
    note: line.note,
    status: 'active',
    void_reason: null,
  }))
}

async function persistOrderLines(orderLines: OrderLine[]): Promise<void> {
  await db.order_lines.bulkPut(orderLines)
  for (const line of orderLines) {
    await enqueue('order_lines', 'upsert', { ...line })
  }
}

export interface PlaceOrderInput {
  merchantId: string
  outletId: string
  deviceId: string
  devicePrefix: string
  staffId: string
  type: OrderType
  tableId: string | null
  lines: CartLine[]
  settings: Settings
}

/**
 * Opens a new order (status 'open', unpaid) — this is "send to kitchen", not
 * checkout. Payment and the final cash-rounding pass come in Phase 3; the
 * totals stored here preview as if paying by DuitNow (no rounding applied
 * yet), same as the cart preview.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  const subtotalSen = cartSubtotalSen(input.lines)
  const totals = calculateTotals({
    subtotalSen,
    paymentMethod: 'duitnow_qr',
    settings: input.settings,
  })
  const orderNo = await generateOrderNo(input.deviceId, input.devicePrefix)

  const order: Order = {
    id: crypto.randomUUID(),
    merchant_id: input.merchantId,
    outlet_id: input.outletId,
    device_id: input.deviceId,
    order_no: orderNo,
    type: input.type,
    table_id: input.tableId,
    status: 'open',
    subtotal_sen: totals.subtotal_sen,
    service_charge_sen: totals.service_charge_sen,
    sst_sen: totals.sst_sen,
    rounding_sen: totals.rounding_sen,
    total_sen: totals.total_sen,
    created_by: input.staffId,
    created_at: new Date().toISOString(),
    paid_at: null,
    synced_at: null,
  }

  await db.orders.put(order)
  await enqueue('orders', 'upsert', { ...order })
  await persistOrderLines(linesToOrderLines(input.merchantId, order.id, input.lines))

  return order
}

/** Replaces an open order's lines and recomputes its totals — used to add/change items on a held order. */
export async function updateOpenOrder(
  orderId: string,
  lines: CartLine[],
  settings: Settings,
): Promise<Order> {
  const existing = await db.orders.get(orderId)
  if (!existing) throw new Error(`Order not found: ${orderId}`)

  const subtotalSen = cartSubtotalSen(lines)
  const totals = calculateTotals({
    subtotalSen,
    paymentMethod: 'duitnow_qr',
    settings,
  })

  const updatedOrder: Order = {
    ...existing,
    subtotal_sen: totals.subtotal_sen,
    service_charge_sen: totals.service_charge_sen,
    sst_sen: totals.sst_sen,
    rounding_sen: totals.rounding_sen,
    total_sen: totals.total_sen,
  }

  const oldLines = await db.order_lines.where({ order_id: orderId }).toArray()
  await db.order_lines.bulkDelete(oldLines.map((line) => line.id))
  for (const line of oldLines) {
    await enqueue('order_lines', 'delete', { id: line.id })
  }

  await db.orders.put(updatedOrder)
  await enqueue('orders', 'upsert', { ...updatedOrder })
  await persistOrderLines(linesToOrderLines(existing.merchant_id, orderId, lines))

  return updatedOrder
}

export async function listOpenOrders(outletId: string): Promise<Order[]> {
  return db.orders.where({ outlet_id: outletId, status: 'open' }).toArray()
}

/** Most recent orders for this outlet, any status, newest first. */
export async function listRecentOrders(outletId: string, limit = 50): Promise<Order[]> {
  const orders = await db.orders.where({ outlet_id: outletId }).toArray()
  return orders.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
}

export async function getOrder(orderId: string): Promise<Order | undefined> {
  return db.orders.get(orderId)
}

/**
 * CLAUDE.md section 7: "Paid orders cannot be edited, only voided ... always
 * logged in audit_log." The audit_log entry is the refund record — there's
 * no separate refunds table in section 6's schema, and section 9 already
 * treats money movement as happening outside this system for QR payments;
 * for cash, the actual handing-back of money is a manual step the audit log
 * documents rather than automates. Caller is responsible for getting the
 * manager/owner PIN approval first (see features/auth/pinLogin.ts).
 */
export async function voidOrder(
  orderId: string,
  approverStaffId: string,
  reason: string,
): Promise<Order> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`Order not found: ${orderId}`)
  if (order.status === 'void') throw new Error('Order is already void')
  if (!reason.trim()) throw new Error('A reason is required')

  const updatedOrder: Order = { ...order, status: 'void' }
  await db.orders.put(updatedOrder)
  await enqueue('orders', 'upsert', { ...updatedOrder })

  const audit: AuditLog = {
    id: crypto.randomUUID(),
    merchant_id: order.merchant_id,
    staff_id: approverStaffId,
    action: 'void_order',
    details: {
      order_id: order.id,
      order_no: order.order_no,
      previous_status: order.status,
      total_sen: order.total_sen,
      reason: reason.trim(),
    },
    created_at: new Date().toISOString(),
  }
  await db.audit_log.put(audit)
  await enqueue('audit_log', 'upsert', { ...audit })

  return updatedOrder
}

/** The lines of an open order, reshaped back into editable cart lines. */
export async function loadOrderAsCartLines(orderId: string): Promise<CartLine[]> {
  const lines = await db.order_lines.where({ order_id: orderId, status: 'active' }).toArray()
  return lines.map((line) => ({
    lineId: crypto.randomUUID(),
    itemId: line.item_id,
    name: line.name_snapshot,
    unitPriceSen: line.unit_price_sen,
    qty: line.qty,
    modifiers: line.modifiers_snapshot,
    note: line.note,
  }))
}
