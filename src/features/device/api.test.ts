import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { clearActiveMerchant, getActiveDeviceId } from '../../lib/localSession'
import { ensureActiveDevice } from './api'

beforeEach(async () => {
  await db.devices.clear()
  await db.sync_queue.clear()
  clearActiveMerchant()
})

describe('ensureActiveDevice', () => {
  it('creates a device the first time and remembers it locally', async () => {
    const device = await ensureActiveDevice('merchant-1', 'outlet-1')

    expect(device.merchant_id).toBe('merchant-1')
    expect(device.outlet_id).toBe('outlet-1')
    expect(device.receipt_prefix).toBe('D1')
    expect(getActiveDeviceId()).toBe(device.id)
    expect(await db.devices.get(device.id)).toEqual(device)

    const queued = await db.sync_queue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ table: 'devices', op: 'upsert' })
  })

  it('returns the same device on a second call', async () => {
    const first = await ensureActiveDevice('merchant-1', 'outlet-1')
    const second = await ensureActiveDevice('merchant-1', 'outlet-1')
    expect(second.id).toBe(first.id)
    expect(await db.devices.count()).toBe(1)
  })

  it('numbers a second outlet’s first device starting at 1 again', async () => {
    await ensureActiveDevice('merchant-1', 'outlet-1')
    clearActiveMerchant()
    const device = await ensureActiveDevice('merchant-1', 'outlet-2')
    expect(device.receipt_prefix).toBe('D1')
  })

  it('creates only one device when called concurrently (e.g. StrictMode double-invoke)', async () => {
    const [first, second] = await Promise.all([
      ensureActiveDevice('merchant-1', 'outlet-1'),
      ensureActiveDevice('merchant-1', 'outlet-1'),
    ])
    expect(second.id).toBe(first.id)
    expect(await db.devices.count()).toBe(1)
    expect(await db.sync_queue.count()).toBe(1)
  })
})
