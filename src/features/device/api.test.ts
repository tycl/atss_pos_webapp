import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { clearActiveMerchant, getActiveDeviceId, setActiveMerchantId } from '../../lib/localSession'
import {
  claimExistingDevice,
  ensureActiveDevice,
  getCachedActiveDevice,
  listClaimableDevices,
} from './api'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

beforeEach(async () => {
  await db.devices.clear()
  await db.sync_queue.clear()
  await db.merchants.clear()
  clearActiveMerchant()
  fromMock.mockReset()
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

  it('creates a new device instead of reusing one cached for a different merchant', async () => {
    const first = await ensureActiveDevice('merchant-1', 'outlet-1')

    const second = await ensureActiveDevice('merchant-2', 'outlet-2')

    expect(second.id).not.toBe(first.id)
    expect(second.merchant_id).toBe('merchant-2')
    expect(second.outlet_id).toBe('outlet-2')
    expect(getActiveDeviceId()).toBe(second.id)
    expect(await db.devices.count()).toBe(2)
  })

  it('creates a new device instead of reusing one cached for a different outlet of the same merchant', async () => {
    const first = await ensureActiveDevice('merchant-1', 'outlet-1')

    const second = await ensureActiveDevice('merchant-1', 'outlet-2')

    expect(second.id).not.toBe(first.id)
    expect(second.outlet_id).toBe('outlet-2')
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

describe('getCachedActiveDevice', () => {
  it('returns null when nothing is cached yet', async () => {
    expect(await getCachedActiveDevice('merchant-1', 'outlet-1')).toBeNull()
  })

  it('returns the cached device once ensureActiveDevice has created one', async () => {
    const created = await ensureActiveDevice('merchant-1', 'outlet-1')
    expect(await getCachedActiveDevice('merchant-1', 'outlet-1')).toEqual(created)
  })

  it('returns null when the cached device belongs to a different merchant/outlet', async () => {
    await ensureActiveDevice('merchant-1', 'outlet-1')
    expect(await getCachedActiveDevice('merchant-2', 'outlet-1')).toBeNull()
  })
})

describe('listClaimableDevices', () => {
  it('returns this outlet’s active devices from Supabase', async () => {
    const devices = [{ id: 'device-1', outlet_id: 'outlet-1', label: 'Device 1', active: true }]
    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ order: async () => ({ data: devices, error: null }) }) }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    expect(await listClaimableDevices('outlet-1')).toEqual(devices)
  })

  it('skips the Supabase call entirely for a Basic-plan merchant', async () => {
    await db.merchants.put({ id: 'merchant-1', plan: 'basic' } as never)
    setActiveMerchantId('merchant-1')
    fromMock.mockImplementation(() => {
      throw new Error('should not call Supabase for a Basic-plan merchant')
    })

    expect(await listClaimableDevices('outlet-1')).toEqual([])
  })

  it('propagates a Supabase read error', async () => {
    const readError = new Error('network error')
    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ order: async () => ({ data: null, error: readError }) }) }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    await expect(listClaimableDevices('outlet-1')).rejects.toBe(readError)
  })
})

describe('claimExistingDevice', () => {
  it('caches the given device locally as this browser’s active device, without writing to Supabase', async () => {
    const device = {
      id: 'device-7',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      label: 'Counter 1',
      receipt_prefix: 'C1',
      active: true,
    }

    const result = await claimExistingDevice(device)

    expect(result).toEqual(device)
    expect(await db.devices.get('device-7')).toEqual(device)
    expect(getActiveDeviceId()).toBe('device-7')
    expect(await db.sync_queue.count()).toBe(0)
    expect(fromMock).not.toHaveBeenCalled()
  })
})
