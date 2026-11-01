import { beforeEach, describe, expect, it } from 'vitest'
import type { CartLine } from '../../lib/cart'
import { db } from '../../lib/db'
import type { Settings } from '../../lib/types'
import {
  applyDiscount,
  generateOrderNo,
  getOrder,
  listOpenOrders,
  listRecentOrders,
  loadOrderAsCartLines,
  placeOrder,
  updateOpenOrder,
  voidOrder,
} from './orderApi'

const MERCHANT_ID = 'merchant-1'
const OUTLET_ID = 'outlet-1'
const DEVICE_ID = 'device-1'
const STAFF_ID = 'staff-1'

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

function tehAis(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineId: crypto.randomUUID(),
    itemId: 'item-1',
    name: 'Teh Ais',
    unitPriceSen: 250,
    qty: 2,
    modifiers: [],
    note: null,
    ...overrides,
  }
}

beforeEach(async () => {
  await db.orders.clear()
  await db.order_lines.clear()
  await db.audit_log.clear()
  await db.sync_queue.clear()
})

describe('generateOrderNo', () => {
  it('starts at 1 for a device with no orders today', async () => {
    const orderNo = await generateOrderNo(DEVICE_ID, 'D1')
    expect(orderNo).toMatch(/^D1-\d{8}-1$/)
  })

  it('increments after placing an order on the same device', async () => {
    await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()],
      settings: allOffSettings,
    })
    const orderNo = await generateOrderNo(DEVICE_ID, 'D1')
    expect(orderNo).toMatch(/^D1-\d{8}-2$/)
  })

  it('counts independently per device', async () => {
    await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()],
      settings: allOffSettings,
    })
    const orderNo = await generateOrderNo('device-2', 'D2')
    expect(orderNo).toMatch(/^D2-\d{8}-1$/)
  })
})

describe('placeOrder', () => {
  it('creates an open, unpaid order with lines and queues both for sync', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'dine_in',
      tableId: 'table-1',
      lines: [tehAis()],
      settings: allOffSettings,
    })

    expect(order.status).toBe('open')
    expect(order.paid_at).toBeNull()
    expect(order.subtotal_sen).toBe(500)
    expect(order.total_sen).toBe(500)

    const storedLines = await db.order_lines.where({ order_id: order.id }).toArray()
    expect(storedLines).toHaveLength(1)
    expect(storedLines[0]).toMatchObject({ name_snapshot: 'Teh Ais', qty: 2, line_total_sen: 500 })

    const queuedTables = (await db.sync_queue.toArray()).map((q) => q.table)
    expect(queuedTables).toContain('orders')
    expect(queuedTables).toContain('order_lines')
  })

  it('applies service charge and SST to the order totals', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis({ qty: 1 })],
      settings: {
        ...allOffSettings,
        service_charge_enabled: true,
        service_charge_rate_bp: 1000,
        sst_enabled: true,
        sst_rate_bp: 600,
      },
    })
    // 250 -> +10% = 25 -> 275 -> +6% = 16.5 -> 17
    expect(order.service_charge_sen).toBe(25)
    expect(order.sst_sen).toBe(17)
    expect(order.total_sen).toBe(292)
    expect(order.rounding_sen).toBe(0)
  })
})

describe('listOpenOrders / getOrder', () => {
  it('lists only open orders for the given outlet', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()],
      settings: allOffSettings,
    })
    await db.orders.put({
      ...(await getOrder(order.id))!,
      id: 'paid-order',
      status: 'paid',
    })

    const open = await listOpenOrders(OUTLET_ID)
    expect(open.map((o) => o.id)).toEqual([order.id])
  })
})

describe('updateOpenOrder', () => {
  it('replaces lines and recomputes totals', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'dine_in',
      tableId: 'table-1',
      lines: [tehAis({ qty: 1 })],
      settings: allOffSettings,
    })
    expect(order.subtotal_sen).toBe(250)

    const updated = await updateOpenOrder(
      order.id,
      [
        tehAis({ qty: 3 }),
        tehAis({
          lineId: crypto.randomUUID(),
          itemId: 'item-2',
          name: 'Water',
          unitPriceSen: 100,
          qty: 1,
        }),
      ],
      allOffSettings,
    )

    expect(updated.subtotal_sen).toBe(850) // 250*3 + 100
    const storedLines = await db.order_lines.where({ order_id: order.id }).toArray()
    expect(storedLines).toHaveLength(2)

    const queuedDeletes = (await db.sync_queue.toArray()).filter(
      (q) => q.table === 'order_lines' && q.op === 'delete',
    )
    expect(queuedDeletes).toHaveLength(1)
  })

  it('throws for an order that does not exist', async () => {
    await expect(updateOpenOrder('missing', [], allOffSettings)).rejects.toThrow()
  })

  it('clamps an existing discount down if the new subtotal is smaller', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis({ qty: 2 })], // subtotal 500
      settings: allOffSettings,
    })
    await applyDiscount(order.id, 'manager-1', 400, 'Loyalty discount', allOffSettings)

    const updated = await updateOpenOrder(order.id, [tehAis({ qty: 1 })], allOffSettings) // subtotal 250
    expect(updated.subtotal_sen).toBe(250)
    expect(updated.discount_sen).toBe(250)
  })
})

describe('applyDiscount', () => {
  it('reduces the total and writes an audit_log entry', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()], // subtotal 500
      settings: allOffSettings,
    })

    const updated = await applyDiscount(order.id, 'manager-1', 100, 'Regular customer', allOffSettings)
    expect(updated.discount_sen).toBe(100)
    expect(updated.discount_reason).toBe('Regular customer')
    expect(updated.total_sen).toBe(400)
    expect((await getOrder(order.id))?.total_sen).toBe(400)

    const audit = await db.audit_log.toArray()
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      merchant_id: MERCHANT_ID,
      staff_id: 'manager-1',
      action: 'apply_discount',
      details: {
        order_id: order.id,
        order_no: order.order_no,
        discount_sen: 100,
        reason: 'Regular customer',
      },
    })

    const queuedTables = (await db.sync_queue.toArray()).map((q) => q.table)
    expect(queuedTables).toContain('orders')
    expect(queuedTables).toContain('audit_log')
  })

  it('clears the discount when set back to zero', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()],
      settings: allOffSettings,
    })
    await applyDiscount(order.id, 'manager-1', 100, 'Regular customer', allOffSettings)

    const updated = await applyDiscount(order.id, 'manager-1', 0, 'Mistake', allOffSettings)
    expect(updated.discount_sen).toBe(0)
    expect(updated.discount_reason).toBeNull()
    expect(updated.total_sen).toBe(500)
  })

  it('refuses a discount larger than the subtotal', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()], // subtotal 500
      settings: allOffSettings,
    })

    await expect(
      applyDiscount(order.id, 'manager-1', 501, 'Too generous', allOffSettings),
    ).rejects.toThrow('exceed the subtotal')
  })

  it('requires a non-blank reason', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()],
      settings: allOffSettings,
    })

    await expect(applyDiscount(order.id, 'manager-1', 100, '   ', allOffSettings)).rejects.toThrow(
      'reason is required',
    )
  })

  it('refuses to discount a paid order', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()],
      settings: allOffSettings,
    })
    await db.orders.put({ ...order, status: 'paid' })

    await expect(
      applyDiscount(order.id, 'manager-1', 100, 'Too late', allOffSettings),
    ).rejects.toThrow('not open')
  })

  it('throws for an order that does not exist', async () => {
    await expect(
      applyDiscount('missing', 'manager-1', 100, 'reason', allOffSettings),
    ).rejects.toThrow('not found')
  })
})

describe('loadOrderAsCartLines', () => {
  it('round-trips an order’s lines back into cart line shape', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'dine_in',
      tableId: 'table-1',
      lines: [
        tehAis({
          qty: 2,
          modifiers: [{ modifier_id: 'm1', name: 'Extra shot', price_sen: 150 }],
          note: 'less ice',
        }),
      ],
      settings: allOffSettings,
    })

    const cartLines = await loadOrderAsCartLines(order.id)
    expect(cartLines).toHaveLength(1)
    expect(cartLines[0]).toMatchObject({
      itemId: 'item-1',
      name: 'Teh Ais',
      unitPriceSen: 250,
      qty: 2,
      note: 'less ice',
      modifiers: [{ modifier_id: 'm1', name: 'Extra shot', price_sen: 150 }],
    })
  })
})

describe('listRecentOrders', () => {
  it('returns this outlet’s orders newest first, any status', async () => {
    const first = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()],
      settings: allOffSettings,
    })
    // created_at is millisecond-precision; without this, a fast run could
    // give both orders the exact same timestamp and make the sort order
    // (a display nicety, not data integrity — unlike the sync queue) flaky.
    await new Promise((resolve) => setTimeout(resolve, 2))
    const second = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()],
      settings: allOffSettings,
    })

    const recent = await listRecentOrders(OUTLET_ID)
    expect(recent.map((o) => o.id)).toEqual([second.id, first.id])
  })

  it('respects the limit', async () => {
    for (let i = 0; i < 3; i++) {
      await placeOrder({
        merchantId: MERCHANT_ID,
        outletId: OUTLET_ID,
        deviceId: DEVICE_ID,
        devicePrefix: 'D1',
        staffId: STAFF_ID,
        type: 'takeaway',
        tableId: null,
        lines: [tehAis()],
        settings: allOffSettings,
      })
    }
    expect(await listRecentOrders(OUTLET_ID, 2)).toHaveLength(2)
  })
})

describe('voidOrder', () => {
  it('marks the order void and writes an audit_log entry', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()],
      settings: allOffSettings,
    })

    const updated = await voidOrder(order.id, 'manager-1', 'Customer changed their mind')
    expect(updated.status).toBe('void')
    expect((await getOrder(order.id))?.status).toBe('void')

    const audit = await db.audit_log.toArray()
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      merchant_id: MERCHANT_ID,
      staff_id: 'manager-1',
      action: 'void_order',
      details: {
        order_id: order.id,
        order_no: order.order_no,
        reason: 'Customer changed their mind',
      },
    })

    const queuedTables = (await db.sync_queue.toArray()).map((q) => q.table)
    expect(queuedTables).toContain('orders')
    expect(queuedTables).toContain('audit_log')
  })

  it('refuses to void an order that is already void', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()],
      settings: allOffSettings,
    })
    await voidOrder(order.id, 'manager-1', 'first void')

    await expect(voidOrder(order.id, 'manager-1', 'second attempt')).rejects.toThrow('already void')
  })

  it('requires a non-blank reason', async () => {
    const order = await placeOrder({
      merchantId: MERCHANT_ID,
      outletId: OUTLET_ID,
      deviceId: DEVICE_ID,
      devicePrefix: 'D1',
      staffId: STAFF_ID,
      type: 'takeaway',
      tableId: null,
      lines: [tehAis()],
      settings: allOffSettings,
    })

    await expect(voidOrder(order.id, 'manager-1', '   ')).rejects.toThrow('reason is required')
  })

  it('throws for an order that does not exist', async () => {
    await expect(voidOrder('missing', 'manager-1', 'reason')).rejects.toThrow('not found')
  })
})
