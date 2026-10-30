import { db } from '../../lib/db'
import type { Shift } from '../../lib/types'
import { enqueue } from '../sync/queue'

/** The open (unclosed) shift for this device, if any. One device should only ever have one at a time. */
export async function getActiveShift(deviceId: string): Promise<Shift | undefined> {
  const shifts = await db.shifts.where({ device_id: deviceId }).toArray()
  return shifts.find((shift) => shift.closed_at === null)
}

export interface OpenShiftInput {
  merchantId: string
  outletId: string
  deviceId: string
  staffId: string
  openingFloatSen: number
}

export async function openShift(input: OpenShiftInput): Promise<Shift> {
  const existing = await getActiveShift(input.deviceId)
  if (existing) throw new Error('A shift is already open on this device')

  const shift: Shift = {
    id: crypto.randomUUID(),
    merchant_id: input.merchantId,
    outlet_id: input.outletId,
    device_id: input.deviceId,
    opened_by: input.staffId,
    opened_at: new Date().toISOString(),
    opening_float_sen: input.openingFloatSen,
    closed_by: null,
    closed_at: null,
    counted_cash_sen: null,
    expected_cash_sen: null,
    variance_sen: null,
  }

  await db.shifts.put(shift)
  await enqueue('shifts', 'upsert', { ...shift })

  return shift
}

/**
 * Cash actually taken during the shift: cash payments on this device's
 * orders, between opening and now, excluding orders later voided (voiding a
 * paid cash order implies the cash was handed back — see
 * features/ordering/orderApi.ts's voidOrder). Exported so the close-shift
 * UI can preview the expected amount before the cashier counts the drawer.
 */
export async function sumCashSalesSince(deviceId: string, openedAt: string): Promise<number> {
  const orders = await db.orders.where({ device_id: deviceId }).toArray()
  const orderById = new Map(orders.map((order) => [order.id, order]))
  const payments = await db.payments.toArray()

  let total = 0
  for (const payment of payments) {
    if (payment.method !== 'cash') continue
    if (payment.created_at < openedAt) continue
    const order = orderById.get(payment.order_id)
    if (!order || order.status === 'void') continue
    total += payment.amount_sen
  }
  return total
}

export async function closeShift(
  shiftId: string,
  countedCashSen: number,
  staffId: string,
): Promise<Shift> {
  const shift = await db.shifts.get(shiftId)
  if (!shift) throw new Error(`Shift not found: ${shiftId}`)
  if (shift.closed_at !== null) throw new Error('Shift is already closed')

  const cashSales = await sumCashSalesSince(shift.device_id, shift.opened_at)
  const expectedCashSen = shift.opening_float_sen + cashSales

  const updated: Shift = {
    ...shift,
    closed_by: staffId,
    closed_at: new Date().toISOString(),
    counted_cash_sen: countedCashSen,
    expected_cash_sen: expectedCashSen,
    variance_sen: countedCashSen - expectedCashSen,
  }

  await db.shifts.put(updated)
  await enqueue('shifts', 'upsert', { ...updated })

  return updated
}
