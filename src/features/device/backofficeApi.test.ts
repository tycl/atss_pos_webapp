import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listTillsForOutlet, renameTill, requestForceReclaim, setTillActive } from './backofficeApi'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

beforeEach(() => {
  fromMock.mockReset()
})

describe('listTillsForOutlet', () => {
  it('returns every device for the outlet, ordered by label', async () => {
    const devices = [{ id: 'device-1', outlet_id: 'outlet-1', label: 'Device 1', active: true }]
    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: devices, error: null }) }) }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    expect(await listTillsForOutlet('outlet-1')).toEqual(devices)
  })

  it('propagates a Supabase read error', async () => {
    const readError = new Error('network error')
    fromMock.mockImplementation(() => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: null, error: readError }) }) }),
    }))

    await expect(listTillsForOutlet('outlet-1')).rejects.toBe(readError)
  })
})

describe('renameTill', () => {
  it('updates the label and returns the saved row', async () => {
    const saved = { id: 'device-1', label: 'Counter 1' }
    const updateMock = vi.fn(() => ({
      eq: () => ({ select: () => ({ single: async () => ({ data: saved, error: null }) }) }),
    }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') return { update: updateMock }
      throw new Error(`unexpected table in test: ${table}`)
    })

    const result = await renameTill('device-1', 'Counter 1')

    expect(updateMock).toHaveBeenCalledWith({ label: 'Counter 1' })
    expect(result).toEqual(saved)
  })
})

describe('setTillActive', () => {
  it('updates the active flag and returns the saved row', async () => {
    const saved = { id: 'device-1', active: false }
    const updateMock = vi.fn(() => ({
      eq: () => ({ select: () => ({ single: async () => ({ data: saved, error: null }) }) }),
    }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') return { update: updateMock }
      throw new Error(`unexpected table in test: ${table}`)
    })

    const result = await setTillActive('device-1', false)

    expect(updateMock).toHaveBeenCalledWith({ active: false })
    expect(result).toEqual(saved)
  })
})

describe('requestForceReclaim', () => {
  it('sets force_reclaim_requested_at to a timestamp and returns the saved row', async () => {
    const saved = { id: 'device-1', force_reclaim_requested_at: '2026-01-01T00:00:00.000Z' }
    const updateMock = vi.fn(() => ({
      eq: () => ({ select: () => ({ single: async () => ({ data: saved, error: null }) }) }),
    }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') return { update: updateMock }
      throw new Error(`unexpected table in test: ${table}`)
    })

    const result = await requestForceReclaim('device-1')

    expect(updateMock).toHaveBeenCalledWith({
      force_reclaim_requested_at: expect.any(String),
    })
    expect(result).toEqual(saved)
  })

  it('propagates a Supabase write error', async () => {
    const writeError = new Error('network error')
    fromMock.mockImplementation(() => ({
      update: () => ({
        eq: () => ({ select: () => ({ single: async () => ({ data: null, error: writeError }) }) }),
      }),
    }))

    await expect(requestForceReclaim('device-1')).rejects.toBe(writeError)
  })
})
