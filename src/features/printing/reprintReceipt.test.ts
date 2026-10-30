import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { reprintReceipt } from './reprintReceipt'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

beforeEach(async () => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200 })
  vi.stubGlobal('fetch', fetchMock)

  await db.merchants.clear()
  await db.outlets.clear()
  await db.orders.clear()
  await db.order_lines.clear()
  await db.payments.clear()
  await db.staff.clear()

  await db.merchants.put({
    id: 'm1',
    name: 'Kopitiam ABC',
    ssm_no: null,
    sst_no: null,
    address: null,
    phone: null,
    logo_url: null,
    plan: null,
    status: null,
  })
  await db.outlets.put({
    id: 'o1',
    merchant_id: 'm1',
    name: 'Main',
    address: null,
    receipt_footer: null,
  })
  await db.orders.put({
    id: 'order-1',
    merchant_id: 'm1',
    outlet_id: 'o1',
    device_id: 'd1',
    order_no: 'D1-20260101-1',
    type: 'takeaway',
    table_id: null,
    status: 'paid',
    subtotal_sen: 250,
    service_charge_sen: 0,
    sst_sen: 0,
    rounding_sen: 0,
    total_sen: 250,
    created_by: 's1',
    created_at: '2026-01-01T06:00:00.000Z',
    paid_at: '2026-01-01T06:01:00.000Z',
    synced_at: null,
  })
  await db.payments.put({
    id: 'payment-1',
    merchant_id: 'm1',
    order_id: 'order-1',
    method: 'cash',
    amount_sen: 250,
    cash_received_sen: 300,
    change_sen: 50,
    reference: null,
    created_at: '2026-01-01T06:01:00.000Z',
  })
})

describe('reprintReceipt', () => {
  it('sends the receipt to the bridge without kicking the drawer', async () => {
    await reprintReceipt('order-1', 'http://localhost:7777')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7777/print',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = fetchMock.mock.calls[0][1].body as Uint8Array
    const text = Array.from(body)
      .map((b) => String.fromCharCode(b))
      .join('')
    const drawerKickSequence = String.fromCharCode(0x1b, 0x70, 0x00, 0x19, 0xfa)
    expect(text).not.toContain(drawerKickSequence)
    expect(text).toContain('D1-20260101-1')
  })
})
