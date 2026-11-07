import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPin } from '../../lib/pin'
import type { Device } from '../../lib/types'
import { generatePairingCode, redeemPairingCode, submitPairingCode } from './pairingCodes'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

const MERCHANT_ID = 'merchant-1'
const OUTLET_ID = 'outlet-1'
const DEVICE_ID = 'device-1'

beforeEach(() => {
  fromMock.mockReset()
})

describe('generatePairingCode', () => {
  it('inserts a hashed, 10-minute-expiry row and returns the plaintext code once', async () => {
    let inserted: Record<string, unknown> | null = null
    fromMock.mockImplementation((table: string) => {
      if (table === 'device_pairing_codes') {
        return {
          insert: async (row: Record<string, unknown>) => {
            inserted = row
            return { error: null }
          },
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    const result = await generatePairingCode(MERCHANT_ID, OUTLET_ID, DEVICE_ID)

    expect(result.code).toMatch(/^\d{6}$/)
    expect(inserted).toMatchObject({
      merchant_id: MERCHANT_ID,
      outlet_id: OUTLET_ID,
      device_id: DEVICE_ID,
    })
    expect(inserted!.code_hash).not.toBe(result.code)
    const expiresAtMs = new Date(result.expiresAt).getTime()
    expect(expiresAtMs - Date.now()).toBeGreaterThan(9 * 60_000)
    expect(expiresAtMs - Date.now()).toBeLessThanOrEqual(10 * 60_000)
  })

  it('propagates a Supabase write error', async () => {
    const writeError = new Error('network error')
    fromMock.mockImplementation(() => ({ insert: async () => ({ error: writeError }) }))

    await expect(generatePairingCode(MERCHANT_ID, OUTLET_ID, DEVICE_ID)).rejects.toBe(writeError)
  })
})

describe('redeemPairingCode', () => {
  const DEVICE: Device = {
    id: DEVICE_ID,
    merchant_id: MERCHANT_ID,
    outlet_id: OUTLET_ID,
    label: 'Counter 1',
    receipt_prefix: 'D1',
    active: true,
  }

  function mockCandidates(candidates: { id: string; code_hash: string; device_id: string }[]) {
    const updateMock = vi.fn(() => ({ eq: async () => ({ error: null }) }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'device_pairing_codes') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  gt: () => ({
                    order: async () => ({ data: candidates, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'devices') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: DEVICE, error: null }) }) }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })
    return updateMock
  }

  it('resolves the device and marks the matching code used', async () => {
    const codeHash = await hashPin('123456')
    const updateMock = mockCandidates([{ id: 'code-1', code_hash: codeHash, device_id: DEVICE_ID }])

    const result = await redeemPairingCode(MERCHANT_ID, OUTLET_ID, '123456')

    expect(result).toEqual(DEVICE)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ used_at: expect.any(String) }),
    )
  })

  it('checks each candidate and matches the right one among several', async () => {
    const wrongHash = await hashPin('111111')
    const rightHash = await hashPin('222222')
    mockCandidates([
      { id: 'code-1', code_hash: wrongHash, device_id: 'other-device' },
      { id: 'code-2', code_hash: rightHash, device_id: DEVICE_ID },
    ])

    const result = await redeemPairingCode(MERCHANT_ID, OUTLET_ID, '222222')

    expect(result).toEqual(DEVICE)
  })

  it('rejects a code that matches no unused/unexpired candidate (wrong, expired, or already used)', async () => {
    const codeHash = await hashPin('123456')
    mockCandidates([{ id: 'code-1', code_hash: codeHash, device_id: DEVICE_ID }])

    await expect(redeemPairingCode(MERCHANT_ID, OUTLET_ID, '999999')).rejects.toThrow(
      'Invalid or expired code',
    )
  })

  it('rejects when there are no candidates at all (e.g. everything expired or used)', async () => {
    mockCandidates([])

    await expect(redeemPairingCode(MERCHANT_ID, OUTLET_ID, '123456')).rejects.toThrow(
      'Invalid or expired code',
    )
  })

  it('propagates a Supabase read error', async () => {
    const readError = new Error('network error')
    fromMock.mockImplementation((table: string) => {
      if (table === 'device_pairing_codes') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  gt: () => ({ order: async () => ({ data: null, error: readError }) }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    await expect(redeemPairingCode(MERCHANT_ID, OUTLET_ID, '123456')).rejects.toBe(readError)
  })
})

describe('submitPairingCode', () => {
  it('calls onSuccess with the resolved device when redemption succeeds', async () => {
    const device: Device = {
      id: DEVICE_ID,
      merchant_id: MERCHANT_ID,
      outlet_id: OUTLET_ID,
      label: 'Counter 1',
      receipt_prefix: 'D1',
      active: true,
    }
    const codeHash = await hashPin('123456')
    const updateMock = vi.fn(() => ({ eq: async () => ({ error: null }) }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'device_pairing_codes') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  gt: () => ({
                    order: async () => ({
                      data: [{ id: 'code-1', code_hash: codeHash, device_id: DEVICE_ID }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'devices') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: device, error: null }) }) }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    const onSuccess = vi.fn()
    const onError = vi.fn()

    await submitPairingCode(MERCHANT_ID, OUTLET_ID, '123456', { onSuccess, onError })

    expect(onSuccess).toHaveBeenCalledWith(device)
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onError with the generic message and never onSuccess when redemption fails', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'device_pairing_codes') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({ gt: () => ({ order: async () => ({ data: [], error: null }) }) }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    const onSuccess = vi.fn()
    const onError = vi.fn()

    await submitPairingCode(MERCHANT_ID, OUTLET_ID, '000000', { onSuccess, onError })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('Invalid or expired code')
  })
})
