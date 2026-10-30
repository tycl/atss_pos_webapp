import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { buildKitchenTicketData, buildReceiptData } from './buildPrintData'

const MERCHANT_ID = 'merchant-1'
const OUTLET_ID = 'outlet-1'

beforeEach(async () => {
  await db.merchants.clear()
  await db.outlets.clear()
  await db.staff.clear()
  await db.orders.clear()
  await db.order_lines.clear()
  await db.payments.clear()
  await db.dine_tables.clear()

  await db.merchants.put({
    id: MERCHANT_ID,
    name: 'Kopitiam ABC',
    ssm_no: 'SSM123',
    sst_no: 'SST999',
    address: null,
    phone: null,
    logo_url: null,
    plan: null,
    status: null,
  })
  await db.outlets.put({
    id: OUTLET_ID,
    merchant_id: MERCHANT_ID,
    name: 'Main',
    address: '1 Jalan Test',
    receipt_footer: 'Thank you!',
  })
  await db.staff.put({
    id: 'staff-1',
    merchant_id: MERCHANT_ID,
    name: 'Alice',
    role: 'cashier',
    pin_hash: 'x',
    active: true,
  })
  await db.dine_tables.put({
    id: 'table-1',
    merchant_id: MERCHANT_ID,
    outlet_id: OUTLET_ID,
    name: 'Table 3',
    sort_order: 0,
  })
  await db.orders.put({
    id: 'order-1',
    merchant_id: MERCHANT_ID,
    outlet_id: OUTLET_ID,
    device_id: 'device-1',
    order_no: 'D1-20260101-1',
    type: 'dine_in',
    table_id: 'table-1',
    status: 'paid',
    subtotal_sen: 800,
    service_charge_sen: 80,
    sst_sen: 53,
    rounding_sen: 2,
    total_sen: 935,
    created_by: 'staff-1',
    created_at: '2026-01-01T06:00:00.000Z',
    paid_at: '2026-01-01T06:05:00.000Z',
    synced_at: null,
  })
  await db.order_lines.put({
    id: 'line-1',
    merchant_id: MERCHANT_ID,
    order_id: 'order-1',
    item_id: 'item-1',
    name_snapshot: 'Teh Ais',
    unit_price_sen: 250,
    qty: 2,
    modifiers_snapshot: [{ modifier_id: 'm1', name: 'Extra shot', price_sen: 150 }],
    line_total_sen: 800,
    note: 'less ice',
    status: 'active',
    void_reason: null,
  })
  // A voided line must not appear in either printout.
  await db.order_lines.put({
    id: 'line-2',
    merchant_id: MERCHANT_ID,
    order_id: 'order-1',
    item_id: 'item-2',
    name_snapshot: 'Kopi O',
    unit_price_sen: 250,
    qty: 1,
    modifiers_snapshot: [],
    line_total_sen: 250,
    note: null,
    status: 'void',
    void_reason: 'customer changed mind',
  })
  await db.payments.put({
    id: 'payment-1',
    merchant_id: MERCHANT_ID,
    order_id: 'order-1',
    method: 'cash',
    amount_sen: 935,
    cash_received_sen: 1000,
    change_sen: 65,
    reference: null,
    created_at: '2026-01-01T06:05:00.000Z',
  })
})

describe('buildReceiptData', () => {
  it('assembles every section 7 field from the order, merchant, outlet, staff, and payment', async () => {
    const data = await buildReceiptData('order-1')

    expect(data.shopName).toBe('Kopitiam ABC')
    expect(data.ssmNo).toBe('SSM123')
    expect(data.sstNo).toBe('SST999')
    expect(data.address).toBe('1 Jalan Test')
    expect(data.receiptFooter).toBe('Thank you!')
    expect(data.receiptNo).toBe('D1-20260101-1')
    expect(data.cashierName).toBe('Alice')
    expect(data.lines).toHaveLength(1)
    expect(data.lines[0]).toMatchObject({ name: 'Teh Ais', qty: 2, note: 'less ice' })
    expect(data.lines[0].modifiers).toEqual([{ name: 'Extra shot', priceSen: 150 }])
    expect(data.totalSen).toBe(935)
    expect(data.paymentMethod).toBe('cash')
    expect(data.cashReceivedSen).toBe(1000)
    expect(data.changeSen).toBe(65)
  })

  it('throws for an order that does not exist', async () => {
    await expect(buildReceiptData('missing')).rejects.toThrow('not found')
  })
})

describe('buildKitchenTicketData', () => {
  it('assembles table/order identity and only active lines, with no prices', async () => {
    const data = await buildKitchenTicketData('order-1')

    expect(data.receiptNo).toBe('D1-20260101-1')
    expect(data.orderType).toBe('dine_in')
    expect(data.tableName).toBe('Table 3')
    expect(data.lines).toHaveLength(1)
    expect(data.lines[0]).toMatchObject({
      name: 'Teh Ais',
      qty: 2,
      modifiers: ['Extra shot'],
      note: 'less ice',
    })
  })
})
