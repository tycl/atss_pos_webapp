import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import type { Order, Payment } from '../../lib/types'
import { closeShift, getActiveShift, openShift } from './api'

const MERCHANT_ID = 'merchant-1'
const OUTLET_ID = 'outlet-1'
const DEVICE_ID = 'device-1'
const STAFF_ID = 'staff-1'

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: crypto.randomUUID(),
    merchant_id: MERCHANT_ID,
    outlet_id: OUTLET_ID,
    device_id: DEVICE_ID,
    order_no: 'D1-20260101-1',
    type: 'takeaway',
    table_id: null,
    status: 'paid',
    subtotal_sen: 1000,
    discount_sen: 0,
    discount_reason: null,
    service_charge_sen: 0,
    sst_sen: 0,
    rounding_sen: 0,
    total_sen: 1000,
    created_by: STAFF_ID,
    created_at: new Date().toISOString(),
    paid_at: new Date().toISOString(),
    synced_at: null,
    ...overrides,
  }
}

function payment(orderId: string, overrides: Partial<Payment> = {}): Payment {
  return {
    id: crypto.randomUUID(),
    merchant_id: MERCHANT_ID,
    order_id: orderId,
    method: 'cash',
    amount_sen: 1000,
    cash_received_sen: 1000,
    change_sen: 0,
    reference: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(async () => {
  await db.shifts.clear()
  await db.orders.clear()
  await db.payments.clear()
  await db.sync_queue.clear()
})

describe('openShift', () => {
  it('opens a shift with the given float', async () => {
    const shift = await openShift({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      staffId: STAFF_ID,
      openingFloatSen: 10000,
    })

    expect(shift.opening_float_sen).toBe(10000)
    expect(shift.closed_at).toBeNull()
    expect(await getActiveShift(DEVICE_ID)).toMatchObject({ id: shift.id })

    const queued = await db.sync_queue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ table: 'shifts', op: 'upsert' })
  })

  it('refuses to open a second shift on the same device', async () => {
    await openShift({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      staffId: STAFF_ID,
      openingFloatSen: 10000,
    })

    await expect(
      openShift({
        merchantId: MERCHANT_ID,
        outletId: OUTLET_ID,
        deviceId: DEVICE_ID,
        staffId: STAFF_ID,
        openingFloatSen: 5000,
      }),
    ).rejects.toThrow('already open')
  })
})

describe('closeShift', () => {
  it('computes expected cash as opening float + cash sales, and the variance', async () => {
    const shift = await openShift({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      staffId: STAFF_ID,
      openingFloatSen: 10000,
    })

    const cashOrder = order({ total_sen: 1000 })
    await db.orders.put(cashOrder)
    await db.payments.put(payment(cashOrder.id, { method: 'cash', amount_sen: 1000 }))

    const qrOrder = order({ total_sen: 2000 })
    await db.orders.put(qrOrder)
    await db.payments.put(
      payment(qrOrder.id, {
        method: 'duitnow_qr',
        amount_sen: 2000,
        cash_received_sen: null,
        change_sen: null,
      }),
    )

    // expected: 10000 (float) + 1000 (cash sale) = 11000; QR sale doesn't count toward cash.
    const closed = await closeShift(shift.id, 11200, STAFF_ID)
    expect(closed.expected_cash_sen).toBe(11000)
    expect(closed.counted_cash_sen).toBe(11200)
    expect(closed.variance_sen).toBe(200)
    expect(closed.closed_by).toBe(STAFF_ID)
    expect(closed.closed_at).not.toBeNull()

    expect(await getActiveShift(DEVICE_ID)).toBeUndefined()
  })

  it('excludes cash payments on orders that were later voided', async () => {
    const shift = await openShift({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      staffId: STAFF_ID,
      openingFloatSen: 10000,
    })

    const voidedOrder = order({ total_sen: 1000, status: 'void' })
    await db.orders.put(voidedOrder)
    await db.payments.put(payment(voidedOrder.id, { method: 'cash', amount_sen: 1000 }))

    const closed = await closeShift(shift.id, 10000, STAFF_ID)
    expect(closed.expected_cash_sen).toBe(10000)
    expect(closed.variance_sen).toBe(0)
  })

  it('ignores cash payments made before the shift opened', async () => {
    const earlierOrder = order({ total_sen: 1000 })
    await db.orders.put(earlierOrder)
    await db.payments.put(
      payment(earlierOrder.id, {
        method: 'cash',
        amount_sen: 1000,
        created_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    )

    const shift = await openShift({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      staffId: STAFF_ID,
      openingFloatSen: 10000,
    })

    const closed = await closeShift(shift.id, 10000, STAFF_ID)
    expect(closed.expected_cash_sen).toBe(10000)
  })

  it('throws for a shift that does not exist', async () => {
    await expect(closeShift('missing', 0, STAFF_ID)).rejects.toThrow('not found')
  })

  it('refuses to close an already-closed shift', async () => {
    const shift = await openShift({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      staffId: STAFF_ID,
      openingFloatSen: 10000,
    })
    await closeShift(shift.id, 10000, STAFF_ID)

    await expect(closeShift(shift.id, 10000, STAFF_ID)).rejects.toThrow('already closed')
  })
})
