import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import type { SyncQueueItem } from '../../lib/types'
import { reassignOrderNumber } from './orderConflictResolution'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

function makeItem(payload: Record<string, unknown>): SyncQueueItem {
  return {
    id: 'queue-item-1',
    table: 'orders',
    op: 'upsert',
    payload,
    created_at: new Date().toISOString(),
    seq: 1,
    attempts: 0,
    last_error: null,
  }
}

beforeEach(async () => {
  await db.sync_queue.clear()
  await db.orders.clear()
  fromMock.mockReset()
})

describe('reassignOrderNumber', () => {
  it('assigns the next running number after the highest existing one for the same prefix/date', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              like: async () => ({
                data: [{ order_no: 'D1-20261115-0001' }, { order_no: 'D1-20261115-0003' }],
                error: null,
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    const item = makeItem({
      id: 'order-9',
      outlet_id: 'outlet-1',
      order_no: 'D1-20261115-0001',
    })
    await db.sync_queue.add(item)
    await db.orders.add({
      id: 'order-9',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      device_id: 'device-1',
      order_no: 'D1-20261115-0001',
      type: 'takeaway',
      table_id: null,
      status: 'open',
      subtotal_sen: 1000,
      discount_sen: 0,
      discount_reason: null,
      service_charge_sen: 0,
      sst_sen: 0,
      rounding_sen: 0,
      total_sen: 1000,
      created_by: 'staff-1',
      created_at: new Date().toISOString(),
      paid_at: null,
      synced_at: null,
    })

    await reassignOrderNumber(item)

    const updatedQueueItem = await db.sync_queue.get('queue-item-1')
    expect(updatedQueueItem?.payload.order_no).toBe('D1-20261115-0004')

    const updatedOrder = await db.orders.get('order-9')
    expect(updatedOrder?.order_no).toBe('D1-20261115-0004')
  })

  it('handles unpadded legacy order numbers when computing the max', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              like: async () => ({
                data: [{ order_no: 'D1-20261115-2' }, { order_no: 'D1-20261115-10' }],
                error: null,
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    const item = makeItem({
      id: 'order-9',
      outlet_id: 'outlet-1',
      order_no: 'D1-20261115-2',
    })
    await db.sync_queue.add(item)
    await db.orders.add({
      id: 'order-9',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      device_id: 'device-1',
      order_no: 'D1-20261115-2',
      type: 'takeaway',
      table_id: null,
      status: 'open',
      subtotal_sen: 500,
      discount_sen: 0,
      discount_reason: null,
      service_charge_sen: 0,
      sst_sen: 0,
      rounding_sen: 0,
      total_sen: 500,
      created_by: 'staff-1',
      created_at: new Date().toISOString(),
      paid_at: null,
      synced_at: null,
    })

    await reassignOrderNumber(item)

    const updatedQueueItem = await db.sync_queue.get('queue-item-1')
    expect(updatedQueueItem?.payload.order_no).toBe('D1-20261115-0011')
  })

  it('propagates a Supabase read error without mutating anything', async () => {
    const readError = new Error('network error')
    fromMock.mockImplementation(() => ({
      select: () => ({ eq: () => ({ like: async () => ({ data: null, error: readError }) }) }),
    }))

    const item = makeItem({
      id: 'order-9',
      outlet_id: 'outlet-1',
      order_no: 'D1-20261115-0001',
    })
    await db.sync_queue.add(item)
    await db.orders.add({
      id: 'order-9',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      device_id: 'device-1',
      order_no: 'D1-20261115-0001',
      type: 'takeaway',
      table_id: null,
      status: 'open',
      subtotal_sen: 500,
      discount_sen: 0,
      discount_reason: null,
      service_charge_sen: 0,
      sst_sen: 0,
      rounding_sen: 0,
      total_sen: 500,
      created_by: 'staff-1',
      created_at: new Date().toISOString(),
      paid_at: null,
      synced_at: null,
    })

    await expect(reassignOrderNumber(item)).rejects.toBe(readError)

    const untouchedQueueItem = await db.sync_queue.get('queue-item-1')
    expect(untouchedQueueItem?.payload.order_no).toBe('D1-20261115-0001')
  })
})
