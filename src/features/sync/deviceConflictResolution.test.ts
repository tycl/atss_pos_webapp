import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import type { SyncQueueItem } from '../../lib/types'
import { reassignDeviceReceiptPrefix } from './deviceConflictResolution'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

function makeItem(payload: Record<string, unknown>): SyncQueueItem {
  return {
    id: 'queue-item-1',
    table: 'devices',
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
  await db.devices.clear()
  fromMock.mockReset()
})

describe('reassignDeviceReceiptPrefix', () => {
  it('picks the next free prefix given what already exists server-side for the outlet', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') {
        return {
          select: () => ({
            eq: async () => ({
              data: [{ receipt_prefix: 'D1' }, { receipt_prefix: 'D2' }],
              error: null,
            }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    const item = makeItem({ id: 'device-9', outlet_id: 'outlet-1', receipt_prefix: 'D1' })
    await db.sync_queue.add(item)
    await db.devices.add({
      id: 'device-9',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      label: 'Device 9',
      receipt_prefix: 'D1',
      active: true,
    })

    await reassignDeviceReceiptPrefix(item)

    const updatedQueueItem = await db.sync_queue.get('queue-item-1')
    expect(updatedQueueItem?.payload.receipt_prefix).toBe('D3')
    const updatedDevice = await db.devices.get('device-9')
    expect(updatedDevice?.receipt_prefix).toBe('D3')
  })

  it('leaves other payload fields untouched', async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
    }))

    const item = makeItem({
      id: 'device-9',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      label: 'Device 9',
      receipt_prefix: 'D1',
      active: true,
    })
    await db.sync_queue.add(item)
    await db.devices.add({
      id: 'device-9',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      label: 'Device 9',
      receipt_prefix: 'D1',
      active: true,
    })

    await reassignDeviceReceiptPrefix(item)

    const updatedQueueItem = await db.sync_queue.get('queue-item-1')
    expect(updatedQueueItem?.payload).toEqual({
      id: 'device-9',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      label: 'Device 9',
      receipt_prefix: 'D1',
      active: true,
    })
  })

  it('propagates a Supabase read error without mutating anything', async () => {
    const readError = new Error('network error')
    fromMock.mockImplementation(() => ({
      select: () => ({ eq: async () => ({ data: null, error: readError }) }),
    }))

    const item = makeItem({ id: 'device-9', outlet_id: 'outlet-1', receipt_prefix: 'D1' })
    await db.sync_queue.add(item)
    await db.devices.add({
      id: 'device-9',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      label: 'Device 9',
      receipt_prefix: 'D1',
      active: true,
    })

    await expect(reassignDeviceReceiptPrefix(item)).rejects.toBe(readError)

    const untouchedQueueItem = await db.sync_queue.get('queue-item-1')
    expect(untouchedQueueItem?.payload.receipt_prefix).toBe('D1')
  })
})
