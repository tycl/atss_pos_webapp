import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import {
  clearActiveMerchant,
  getDeviceIdForOutlet,
  setActiveDeviceId,
  setActiveMerchantId,
} from '../../lib/localSession'
import {
  claimExistingDevice,
  ensureActiveDevice,
  getCachedActiveDevice,
  invalidateDeviceBinding,
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
  await db.device_bindings.clear()
  // Per-outlet device-id keys aren't scoped to "the active merchant", and
  // these tests pass outlet ids directly without ever setting one active —
  // a plain clearActiveMerchant() wouldn't reach them, so clear localStorage
  // outright to avoid one test's binding leaking into the next (this file's
  // tests share one jsdom/localStorage instance).
  localStorage.clear()
  fromMock.mockReset()
})

describe('ensureActiveDevice', () => {
  it('creates a device the first time and remembers it locally', async () => {
    const device = await ensureActiveDevice('merchant-1', 'outlet-1')

    expect(device.merchant_id).toBe('merchant-1')
    expect(device.outlet_id).toBe('outlet-1')
    expect(device.receipt_prefix).toBe('D1')
    expect(getDeviceIdForOutlet('outlet-1')).toBe(device.id)
    expect(await db.device_bindings.get('outlet-1')).toEqual({
      outlet_id: 'outlet-1',
      device_id: device.id,
    })
    expect(await db.devices.get(device.id)).toEqual(device)

    const queued = await db.sync_queue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ table: 'devices', op: 'upsert' })
  })

  it('assigns the next free prefix instead of just count + 1, when one in the middle is taken', async () => {
    await db.devices.bulkPut([
      {
        id: 'device-d1',
        merchant_id: 'merchant-1',
        outlet_id: 'outlet-1',
        label: 'Device 1',
        receipt_prefix: 'D1',
        active: true,
      },
      {
        id: 'device-d3',
        merchant_id: 'merchant-1',
        outlet_id: 'outlet-1',
        label: 'Device 3',
        receipt_prefix: 'D3',
        active: true,
      },
    ])

    const device = await ensureActiveDevice('merchant-1', 'outlet-1')

    expect(device.receipt_prefix).toBe('D2')
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
    expect(getDeviceIdForOutlet('outlet-2')).toBe(second.id)
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

  it('returns null and clears the binding when the cached device has been deactivated', async () => {
    const created = await ensureActiveDevice('merchant-1', 'outlet-1')
    await db.devices.update(created.id, { active: false })

    expect(await getCachedActiveDevice('merchant-1', 'outlet-1')).toBeNull()
    expect(getDeviceIdForOutlet('outlet-1')).toBeNull()
    expect(await db.device_bindings.get('outlet-1')).toBeUndefined()
  })

  it('adopts and re-saves a binding found only under the legacy global key', async () => {
    await db.devices.put({
      id: 'device-legacy',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      label: 'Device 1',
      receipt_prefix: 'D1',
      active: true,
    })
    setActiveDeviceId('device-legacy')

    const result = await getCachedActiveDevice('merchant-1', 'outlet-1')

    expect(result?.id).toBe('device-legacy')
    expect(getDeviceIdForOutlet('outlet-1')).toBe('device-legacy')
    expect(await db.device_bindings.get('outlet-1')).toEqual({
      outlet_id: 'outlet-1',
      device_id: 'device-legacy',
    })
  })

  it('looks the device up on Supabase when bound but not cached locally, and caches it', async () => {
    const remoteDevice = {
      id: 'device-remote',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      label: 'Counter 2',
      receipt_prefix: 'D2',
      active: true,
    }
    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: remoteDevice, error: null }) }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })
    // Simulate a binding that survived (e.g. a pairing-code claim recorded
    // elsewhere) without the device row itself being cached in Dexie yet.
    setActiveDeviceId('device-remote')

    const result = await getCachedActiveDevice('merchant-1', 'outlet-1')

    expect(result).toEqual(remoteDevice)
    expect(await db.devices.get('device-remote')).toEqual(remoteDevice)
  })

  it('returns null without throwing when bound but the device cannot be found anywhere', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })
    setActiveDeviceId('device-nowhere')

    expect(await getCachedActiveDevice('merchant-1', 'outlet-1')).toBeNull()
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

describe('invalidateDeviceBinding', () => {
  it('clears both the localStorage key and the Dexie binding row', async () => {
    await ensureActiveDevice('merchant-1', 'outlet-1')

    await invalidateDeviceBinding('outlet-1')

    expect(getDeviceIdForOutlet('outlet-1')).toBeNull()
    expect(await db.device_bindings.get('outlet-1')).toBeUndefined()
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
    expect(getDeviceIdForOutlet('outlet-1')).toBe('device-7')
    expect(await db.sync_queue.count()).toBe(0)
    expect(fromMock).not.toHaveBeenCalled()
  })
})
