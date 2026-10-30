import { calculateTotals } from '../../lib/calculateTotals'
import { db } from '../../lib/db'
import type { Order, Payment, PaymentMethod, Settings } from '../../lib/types'
import { enqueue } from '../sync/queue'

async function finalizeOrderPayment(
  order: Order,
  method: PaymentMethod,
  settings: Settings,
  extra: { cashReceivedSen?: number; reference?: string },
): Promise<{ order: Order; payment: Payment }> {
  const totals = calculateTotals({
    subtotalSen: order.subtotal_sen,
    paymentMethod: method,
    settings,
  })

  const updatedOrder: Order = {
    ...order,
    service_charge_sen: totals.service_charge_sen,
    sst_sen: totals.sst_sen,
    rounding_sen: totals.rounding_sen,
    total_sen: totals.total_sen,
    status: 'paid',
    paid_at: new Date().toISOString(),
  }

  const payment: Payment = {
    id: crypto.randomUUID(),
    merchant_id: order.merchant_id,
    order_id: order.id,
    method,
    amount_sen: totals.total_sen,
    cash_received_sen: extra.cashReceivedSen ?? null,
    change_sen:
      extra.cashReceivedSen !== undefined ? extra.cashReceivedSen - totals.total_sen : null,
    reference: extra.reference ?? null,
    created_at: new Date().toISOString(),
  }

  await db.orders.put(updatedOrder)
  await db.payments.put(payment)
  await enqueue('orders', 'upsert', { ...updatedOrder })
  await enqueue('payments', 'upsert', { ...payment })

  return { order: updatedOrder, payment }
}

/**
 * CLAUDE.md section 9: "enter amount received, show change, open cash
 * drawer." The drawer kick happens through the printing interface, which
 * doesn't exist yet — this records the payment and finalizes the order's
 * cash-rounded total; the caller wires up the drawer kick once printing
 * lands.
 */
export async function recordCashPayment(
  orderId: string,
  cashReceivedSen: number,
  settings: Settings,
): Promise<{ order: Order; payment: Payment }> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`Order not found: ${orderId}`)
  if (order.status !== 'open') throw new Error(`Order is not open (status: ${order.status})`)

  const totals = calculateTotals({
    subtotalSen: order.subtotal_sen,
    paymentMethod: 'cash',
    settings,
  })
  if (cashReceivedSen < totals.total_sen) {
    throw new Error('Cash received is less than the total due')
  }

  return finalizeOrderPayment(order, 'cash', settings, { cashReceivedSen })
}

/**
 * CLAUDE.md section 9: static DuitNow QR — no money passes through our
 * system, the cashier just confirms receipt and records a reference.
 */
export async function recordDuitNowPayment(
  orderId: string,
  reference: string,
  settings: Settings,
): Promise<{ order: Order; payment: Payment }> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`Order not found: ${orderId}`)
  if (order.status !== 'open') throw new Error(`Order is not open (status: ${order.status})`)
  if (!reference.trim()) throw new Error('Reference is required')

  return finalizeOrderPayment(order, 'duitnow_qr', settings, { reference: reference.trim() })
}
