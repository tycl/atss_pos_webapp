import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listDevicesForMerchant, listMerchantsWithCounts, setDeviceActive } from './api'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

const MERCHANT_ID = 'merchant-1'

beforeEach(() => {
  fromMock.mockReset()
})

describe('listMerchantsWithCounts', () => {
  it('counts only active devices per merchant', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'merchants') {
        return {
          select: () => ({
            order: async () => ({
              data: [{ id: MERCHANT_ID, name: 'Kopi Corner', plan: 'standard' }],
              error: null,
            }),
          }),
        }
      }
      if (table === 'outlets') {
        return { select: async () => ({ data: [{ merchant_id: MERCHANT_ID }], error: null }) }
      }
      if (table === 'devices') {
        return {
          select: async () => ({
            data: [
              { merchant_id: MERCHANT_ID, active: true },
              { merchant_id: MERCHANT_ID, active: true },
              { merchant_id: MERCHANT_ID, active: false },
            ],
            error: null,
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    const result = await listMerchantsWithCounts()

    expect(result).toEqual([
      {
        id: MERCHANT_ID,
        name: 'Kopi Corner',
        plan: 'standard',
        outletCount: 1,
        deviceCount: 2,
      },
    ])
  })
})

describe('listDevicesForMerchant', () => {
  it('returns that merchant’s devices ordered by label', async () => {
    const devices = [{ id: 'device-1', merchant_id: MERCHANT_ID, label: 'Device 1', active: true }]
    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: devices, error: null }) }) }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    expect(await listDevicesForMerchant(MERCHANT_ID)).toEqual(devices)
  })

  it('propagates a Supabase read error', async () => {
    const readError = new Error('network error')
    fromMock.mockImplementation(() => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: null, error: readError }) }) }),
    }))

    await expect(listDevicesForMerchant(MERCHANT_ID)).rejects.toBe(readError)
  })
})

describe('setDeviceActive', () => {
  it('updates a device’s active flag and returns the saved row', async () => {
    const saved = { id: 'device-1', merchant_id: MERCHANT_ID, active: false }
    const updateMock = vi.fn(() => ({
      eq: () => ({ select: () => ({ single: async () => ({ data: saved, error: null }) }) }),
    }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') return { update: updateMock }
      throw new Error(`unexpected table in test: ${table}`)
    })

    const result = await setDeviceActive('device-1', false)

    expect(updateMock).toHaveBeenCalledWith({ active: false })
    expect(result).toEqual(saved)
  })

  it('propagates a Supabase write error', async () => {
    const writeError = new Error('network error')
    fromMock.mockImplementation(() => ({
      update: () => ({
        eq: () => ({ select: () => ({ single: async () => ({ data: null, error: writeError }) }) }),
      }),
    }))

    await expect(setDeviceActive('device-1', false)).rejects.toBe(writeError)
  })
})
