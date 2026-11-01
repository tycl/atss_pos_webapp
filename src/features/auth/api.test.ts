import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createMerchantWithOutlet } from './api'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

const merchantInsert = vi.fn()
const merchantEq = vi.fn()

beforeEach(() => {
  merchantInsert.mockReset()
  merchantEq.mockReset()
  fromMock.mockReset()

  // The merchants insert resolves to a plain result with no .select() to chain:
  // chaining it on real Postgres fails the SELECT policy with 42501, because the
  // link_owner_to_new_merchant trigger hasn't granted membership at that point.
  merchantInsert.mockResolvedValue({ error: null })
  merchantEq.mockImplementation((_column: string, id: string) => ({
    single: async () => ({ data: { id, name: 'Kopi Corner' }, error: null }),
  }))

  fromMock.mockImplementation((table: string) => {
    if (table === 'merchants') {
      return { insert: merchantInsert, select: () => ({ eq: merchantEq }) }
    }
    if (table === 'outlets') {
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => ({ data: { id: 'outlet-1', ...row }, error: null }),
          }),
        }),
      }
    }
    return { insert: async () => ({ error: null }) }
  })
})

describe('createMerchantWithOutlet', () => {
  it('inserts the merchant with a client id, then reads that same row back', async () => {
    const { merchant } = await createMerchantWithOutlet({
      merchantName: 'Kopi Corner',
      outletName: 'Main',
    })

    const inserted = merchantInsert.mock.calls[0][0] as { id: string; name: string }
    expect(inserted.name).toBe('Kopi Corner')
    expect(inserted.id).toEqual(expect.any(String))
    expect(merchantEq).toHaveBeenCalledWith('id', inserted.id)
    expect(merchant.id).toBe(inserted.id)
  })

  it('caches the merchant returned by the read locally', async () => {
    const { merchant } = await createMerchantWithOutlet({
      merchantName: 'Kopi Corner',
      outletName: 'Main',
    })

    expect(await db.merchants.get(merchant.id)).toMatchObject({ name: 'Kopi Corner' })
  })

  it('stops with the insert error and does not try to read', async () => {
    const insertError = new Error('new row violates row-level security policy')
    merchantInsert.mockResolvedValue({ error: insertError })

    await expect(
      createMerchantWithOutlet({ merchantName: 'Kopi Corner', outletName: 'Main' }),
    ).rejects.toBe(insertError)
    expect(merchantEq).not.toHaveBeenCalled()
  })

  it('throws when the read back fails', async () => {
    const readError = new Error('read failed')
    merchantEq.mockReturnValue({ single: async () => ({ data: null, error: readError }) })

    await expect(
      createMerchantWithOutlet({ merchantName: 'Kopi Corner', outletName: 'Main' }),
    ).rejects.toBe(readError)
  })
})
