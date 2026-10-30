import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import type { Order, OrderLine, Payment } from '../../lib/types'
import { buildDailySalesReport, buildSalesByDayReport, buildTopItemsReport } from './api'

const MERCHANT_ID = 'merchant-1'
const OUTLET_ID = 'outlet-1'
const TODAY = new Date()
const YESTERDAY = new Date(TODAY.getTime() - 24 * 60 * 60 * 1000)
const TWO_DAYS_AGO = new Date(TODAY.getTime() - 2 * 24 * 60 * 60 * 1000)

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: crypto.randomUUID(),
    merchant_id: MERCHANT_ID,
    outlet_id: OUTLET_ID,
    device_id: 'device-1',
    order_no: 'D1-1',
    type: 'takeaway',
    table_id: null,
    status: 'paid',
    subtotal_sen: 1000,
    service_charge_sen: 100,
    sst_sen: 66,
    rounding_sen: 0,
    total_sen: 1166,
    created_by: 'staff-1',
    created_at: TODAY.toISOString(),
    paid_at: TODAY.toISOString(),
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
    amount_sen: 1166,
    cash_received_sen: 1200,
    change_sen: 34,
    reference: null,
    created_at: TODAY.toISOString(),
    ...overrides,
  }
}

function line(orderId: string, overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: crypto.randomUUID(),
    merchant_id: MERCHANT_ID,
    order_id: orderId,
    item_id: 'item-1',
    name_snapshot: 'Teh Ais',
    unit_price_sen: 250,
    qty: 2,
    modifiers_snapshot: [],
    line_total_sen: 500,
    note: null,
    status: 'active',
    void_reason: null,
    ...overrides,
  }
}

beforeEach(async () => {
  await db.orders.clear()
  await db.order_lines.clear()
  await db.payments.clear()
  await db.items.clear()
  await db.categories.clear()
})

describe('buildDailySalesReport', () => {
  it('totals sales, SST, and service charge across today’s paid orders only', async () => {
    const paid1 = order({ total_sen: 1166, sst_sen: 66, service_charge_sen: 100 })
    const paid2 = order({ total_sen: 2332, sst_sen: 132, service_charge_sen: 200 })
    const openOrder = order({ status: 'open', total_sen: 500, sst_sen: 0, service_charge_sen: 0 })
    const yesterdayOrder = order({ created_at: YESTERDAY.toISOString(), total_sen: 9999 })

    await db.orders.bulkPut([paid1, paid2, openOrder, yesterdayOrder])
    await db.payments.bulkPut([
      payment(paid1.id, { method: 'cash', amount_sen: 1166 }),
      payment(paid2.id, {
        method: 'duitnow_qr',
        amount_sen: 2332,
        cash_received_sen: null,
        change_sen: null,
      }),
    ])

    const report = await buildDailySalesReport(OUTLET_ID, TODAY)

    expect(report.paidOrderCount).toBe(2)
    expect(report.totalSalesSen).toBe(1166 + 2332)
    expect(report.sstCollectedSen).toBe(66 + 132)
    expect(report.serviceChargeCollectedSen).toBe(100 + 200)
  })

  it('breaks sales down by payment method', async () => {
    const cashOrder = order({ total_sen: 1000 })
    const qrOrder1 = order({ total_sen: 2000 })
    const qrOrder2 = order({ total_sen: 3000 })
    await db.orders.bulkPut([cashOrder, qrOrder1, qrOrder2])
    await db.payments.bulkPut([
      payment(cashOrder.id, { method: 'cash', amount_sen: 1000 }),
      payment(qrOrder1.id, { method: 'duitnow_qr', amount_sen: 2000 }),
      payment(qrOrder2.id, { method: 'duitnow_qr', amount_sen: 3000 }),
    ])

    const report = await buildDailySalesReport(OUTLET_ID, TODAY)

    const cash = report.salesByMethod.find((m) => m.method === 'cash')
    const qr = report.salesByMethod.find((m) => m.method === 'duitnow_qr')
    expect(cash).toMatchObject({ totalSen: 1000, count: 1 })
    expect(qr).toMatchObject({ totalSen: 5000, count: 2 })
  })

  it('breaks sales down by item and by category, ignoring voided lines', async () => {
    const paidOrder = order()
    await db.orders.put(paidOrder)
    await db.payments.put(payment(paidOrder.id))

    await db.categories.put({
      id: 'cat-1',
      merchant_id: MERCHANT_ID,
      name: 'Drinks',
      sort_order: 0,
    })
    await db.items.put({
      id: 'item-1',
      merchant_id: MERCHANT_ID,
      category_id: 'cat-1',
      name: 'Teh Ais',
      price_sen: 250,
      active: true,
      sort_order: 0,
    })

    await db.order_lines.bulkPut([
      line(paidOrder.id, { item_id: 'item-1', qty: 2, line_total_sen: 500 }),
      line(paidOrder.id, {
        id: crypto.randomUUID(),
        item_id: 'item-1',
        qty: 1,
        line_total_sen: 250,
      }),
      line(paidOrder.id, {
        id: crypto.randomUUID(),
        item_id: 'item-2',
        name_snapshot: 'Kopi O',
        qty: 1,
        line_total_sen: 250,
        status: 'void',
      }),
    ])

    const report = await buildDailySalesReport(OUTLET_ID, TODAY)

    expect(report.salesByItem).toEqual([
      { itemId: 'item-1', name: 'Teh Ais', qty: 3, totalSen: 750 },
    ])
    expect(report.salesByCategory).toEqual([{ categoryId: 'cat-1', name: 'Drinks', totalSen: 750 }])
  })

  it('buckets items with a deleted category as Uncategorized', async () => {
    const paidOrder = order()
    await db.orders.put(paidOrder)
    await db.payments.put(payment(paidOrder.id))
    await db.items.put({
      id: 'item-1',
      merchant_id: MERCHANT_ID,
      category_id: 'deleted-category',
      name: 'Teh Ais',
      price_sen: 250,
      active: true,
      sort_order: 0,
    })
    await db.order_lines.put(line(paidOrder.id, { item_id: 'item-1' }))

    const report = await buildDailySalesReport(OUTLET_ID, TODAY)
    expect(report.salesByCategory).toEqual([
      { categoryId: 'deleted-category', name: 'Unknown category', totalSen: 500 },
    ])
  })

  it('counts voided orders separately from sales', async () => {
    const paidOrder = order({ total_sen: 1000 })
    const voidedOrder = order({ status: 'void', total_sen: 777 })
    await db.orders.bulkPut([paidOrder, voidedOrder])
    await db.payments.put(payment(paidOrder.id, { amount_sen: 1000 }))

    const report = await buildDailySalesReport(OUTLET_ID, TODAY)

    expect(report.voidCount).toBe(1)
    expect(report.voidTotalSen).toBe(777)
    expect(report.totalSalesSen).toBe(1000)
  })

  it('returns zeroed results for a day with no orders', async () => {
    const report = await buildDailySalesReport(OUTLET_ID, TODAY)
    expect(report).toMatchObject({
      totalSalesSen: 0,
      paidOrderCount: 0,
      salesByMethod: [],
      salesByItem: [],
      salesByCategory: [],
      sstCollectedSen: 0,
      serviceChargeCollectedSen: 0,
      voidCount: 0,
      voidTotalSen: 0,
    })
  })
})

describe('buildSalesByDayReport', () => {
  it('returns one summary row per day in the inclusive range', async () => {
    const todayOrder = order({ total_sen: 1000 })
    const yesterdayOrder = order({ created_at: YESTERDAY.toISOString(), total_sen: 2000 })
    await db.orders.bulkPut([todayOrder, yesterdayOrder])
    await db.payments.bulkPut([
      payment(todayOrder.id, { method: 'cash', amount_sen: 1000 }),
      payment(yesterdayOrder.id, {
        method: 'duitnow_qr',
        amount_sen: 2000,
        cash_received_sen: null,
        change_sen: null,
      }),
    ])

    const rows = await buildSalesByDayReport(OUTLET_ID, YESTERDAY, TODAY)

    expect(rows).toHaveLength(2)
    // The range iterates chronologically, so rows[0] is the start date (yesterday).
    expect(rows[0]).toMatchObject({ orderCount: 1, totalSen: 2000, cashSen: 0, qrSen: 2000 })
    expect(rows[1]).toMatchObject({ orderCount: 1, totalSen: 1000, cashSen: 1000, qrSen: 0 })
  })

  it('includes days with zero sales as zeroed rows', async () => {
    const rows = await buildSalesByDayReport(OUTLET_ID, TWO_DAYS_AGO, TODAY)
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.totalSen === 0 && r.orderCount === 0)).toBe(true)
  })
})

describe('buildTopItemsReport', () => {
  it('ranks items by total revenue across the whole range', async () => {
    const todayOrder = order()
    const yesterdayOrder = order({ created_at: YESTERDAY.toISOString() })
    await db.orders.bulkPut([todayOrder, yesterdayOrder])
    await db.payments.bulkPut([payment(todayOrder.id), payment(yesterdayOrder.id)])
    await db.order_lines.bulkPut([
      line(todayOrder.id, {
        item_id: 'item-1',
        name_snapshot: 'Teh Ais',
        qty: 1,
        line_total_sen: 250,
      }),
      line(yesterdayOrder.id, {
        id: crypto.randomUUID(),
        item_id: 'item-1',
        name_snapshot: 'Teh Ais',
        qty: 2,
        line_total_sen: 500,
      }),
      line(yesterdayOrder.id, {
        id: crypto.randomUUID(),
        item_id: 'item-2',
        name_snapshot: 'Nasi Lemak',
        qty: 1,
        line_total_sen: 900,
      }),
    ])

    const top = await buildTopItemsReport(OUTLET_ID, YESTERDAY, TODAY)

    expect(top).toEqual([
      { itemId: 'item-2', name: 'Nasi Lemak', qty: 1, totalSen: 900 },
      { itemId: 'item-1', name: 'Teh Ais', qty: 3, totalSen: 750 },
    ])
  })

  it('respects the limit', async () => {
    const paidOrder = order()
    await db.orders.put(paidOrder)
    await db.payments.put(payment(paidOrder.id))
    await db.order_lines.bulkPut(
      Array.from({ length: 5 }, (_, i) =>
        line(paidOrder.id, {
          id: crypto.randomUUID(),
          item_id: `item-${i}`,
          name_snapshot: `Item ${i}`,
          line_total_sen: 100 * (i + 1),
        }),
      ),
    )

    const top = await buildTopItemsReport(OUTLET_ID, TODAY, TODAY, 2)
    expect(top).toHaveLength(2)
    expect(top[0].itemId).toBe('item-4')
  })
})
