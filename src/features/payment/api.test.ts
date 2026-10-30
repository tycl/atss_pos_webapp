import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import type { Order, Settings } from '../../lib/types'
import { recordCashPayment, recordDuitNowPayment } from './api'

const MERCHANT_ID = 'merchant-1'
const OUTLET_ID = 'outlet-1'

const allOffSettings: Settings = {
  outlet_id: OUTLET_ID,
  merchant_id: MERCHANT_ID,
  sst_enabled: false,
  sst_rate_bp: 0,
  service_charge_enabled: false,
  service_charge_rate_bp: 0,
  cash_rounding_enabled: false,
  duitnow_qr_url: null,
  print_bridge_url: null,
}

function openOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    merchant_id: MERCHANT_ID,
    outlet_id: OUTLET_ID,
    device_id: 'device-1',
    order_no: 'D1-20260101-1',
    type: 'takeaway',
    table_id: null,
    status: 'open',
    subtotal_sen: 1203,
    service_charge_sen: 0,
    sst_sen: 0,
    rounding_sen: 0,
    total_sen: 1203,
    created_by: 'staff-1',
    created_at: new Date().toISOString(),
    paid_at: null,
    synced_at: null,
    ...overrides,
  }
}

beforeEach(async () => {
  await db.orders.clear()
  await db.payments.clear()
  await db.sync_queue.clear()
})

describe('recordCashPayment', () => {
  it('applies cash rounding, records the payment, and marks the order paid', async () => {
    const order = openOrder()
    await db.orders.put(order)

    const { order: updated, payment } = await recordCashPayment(order.id, 1300, {
      ...allOffSettings,
      cash_rounding_enabled: true,
    })

    // subtotal 1203 -> rounds to 1205 (section 7: .03 rounds up)
    expect(updated.rounding_sen).toBe(2)
    expect(updated.total_sen).toBe(1205)
    expect(updated.status).toBe('paid')
    expect(updated.paid_at).not.toBeNull()

    expect(payment.method).toBe('cash')
    expect(payment.amount_sen).toBe(1205)
    expect(payment.cash_received_sen).toBe(1300)
    expect(payment.change_sen).toBe(95)

    expect((await db.orders.get(order.id))?.status).toBe('paid')
    expect(await db.payments.get(payment.id)).toEqual(payment)

    const queuedTables = (await db.sync_queue.toArray()).map((q) => q.table)
    expect(queuedTables).toContain('orders')
    expect(queuedTables).toContain('payments')
  })

  it('rejects insufficient cash', async () => {
    const order = openOrder({ subtotal_sen: 1000, total_sen: 1000 })
    await db.orders.put(order)

    await expect(recordCashPayment(order.id, 500, allOffSettings)).rejects.toThrow(
      'less than the total due',
    )
    expect((await db.orders.get(order.id))?.status).toBe('open')
  })

  it('rejects paying an order that is not open', async () => {
    const order = openOrder({ status: 'paid' })
    await db.orders.put(order)

    await expect(recordCashPayment(order.id, 2000, allOffSettings)).rejects.toThrow('not open')
  })

  it('rejects an order that does not exist', async () => {
    await expect(recordCashPayment('missing', 1000, allOffSettings)).rejects.toThrow('not found')
  })

  it('accepts exact change with zero change due', async () => {
    const order = openOrder({ subtotal_sen: 1000, total_sen: 1000 })
    await db.orders.put(order)

    const { payment } = await recordCashPayment(order.id, 1000, allOffSettings)
    expect(payment.change_sen).toBe(0)
  })
})

describe('recordDuitNowPayment', () => {
  it('never applies cash rounding, even if enabled', async () => {
    const order = openOrder()
    await db.orders.put(order)

    const { order: updated, payment } = await recordDuitNowPayment(order.id, 'REF123', {
      ...allOffSettings,
      cash_rounding_enabled: true,
    })

    expect(updated.rounding_sen).toBe(0)
    expect(updated.total_sen).toBe(1203)
    expect(payment.method).toBe('duitnow_qr')
    expect(payment.reference).toBe('REF123')
    expect(payment.cash_received_sen).toBeNull()
    expect(payment.change_sen).toBeNull()
  })

  it('requires a non-blank reference', async () => {
    const order = openOrder()
    await db.orders.put(order)

    await expect(recordDuitNowPayment(order.id, '   ', allOffSettings)).rejects.toThrow(
      'Reference is required',
    )
  })

  it('rejects paying an order that is not open', async () => {
    const order = openOrder({ status: 'void' })
    await db.orders.put(order)

    await expect(recordDuitNowPayment(order.id, 'REF1', allOffSettings)).rejects.toThrow('not open')
  })
})
