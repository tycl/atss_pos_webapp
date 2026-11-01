import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { getActiveMerchantId, getActiveOutletId } from '../../lib/localSession'
import { listMyMerchants, pullMerchantData } from './pullMerchantData'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

const MERCHANT_ID = 'merchant-1'
const OUTLET_ID = 'outlet-1'

const merchant = { id: MERCHANT_ID, name: 'Kopi Corner' }
const outlet = { id: OUTLET_ID, merchant_id: MERCHANT_ID, name: 'Main' }
const settings = { outlet_id: OUTLET_ID, merchant_id: MERCHANT_ID, sst_enabled: false }
const staff = [
  { id: 'staff-1', merchant_id: MERCHANT_ID, name: 'Alice', role: 'owner', active: true },
]
const categories = [{ id: 'cat-1', merchant_id: MERCHANT_ID, name: 'Drinks', sort_order: 0 }]
const items = [
  { id: 'item-1', merchant_id: MERCHANT_ID, category_id: 'cat-1', name: 'Teh Ais', price_sen: 250 },
]
const groups = [{ id: 'group-1', merchant_id: MERCHANT_ID, name: 'Sugar level' }]
const modifiers = [
  { id: 'mod-1', merchant_id: MERCHANT_ID, group_id: 'group-1', name: 'Less sugar' },
]
const links = [{ merchant_id: MERCHANT_ID, item_id: 'item-1', group_id: 'group-1' }]
const tables = [{ id: 'table-1', merchant_id: MERCHANT_ID, outlet_id: OUTLET_ID, name: 'Table 1' }]

function makeFromMock() {
  return (table: string) => {
    if (table === 'merchants') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: merchant, error: null }) }) }),
      }
    }
    if (table === 'outlets') {
      return {
        select: () => ({ eq: () => ({ order: async () => ({ data: [outlet], error: null }) }) }),
      }
    }
    if (table === 'settings') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: settings, error: null }) }),
        }),
      }
    }
    if (table === 'staff') {
      return { select: () => ({ eq: async () => ({ data: staff, error: null }) }) }
    }
    if (table === 'categories') {
      return { select: () => ({ eq: async () => ({ data: categories, error: null }) }) }
    }
    if (table === 'items') {
      return { select: () => ({ eq: async () => ({ data: items, error: null }) }) }
    }
    if (table === 'modifier_groups') {
      return { select: () => ({ eq: async () => ({ data: groups, error: null }) }) }
    }
    if (table === 'modifiers') {
      return { select: () => ({ eq: async () => ({ data: modifiers, error: null }) }) }
    }
    if (table === 'item_modifier_groups') {
      return { select: () => ({ eq: async () => ({ data: links, error: null }) }) }
    }
    if (table === 'tables') {
      return { select: () => ({ eq: async () => ({ data: tables, error: null }) }) }
    }
    throw new Error(`unexpected table in test: ${table}`)
  }
}

beforeEach(async () => {
  await db.merchants.clear()
  await db.outlets.clear()
  await db.settings.clear()
  await db.staff.clear()
  await db.categories.clear()
  await db.items.clear()
  await db.modifier_groups.clear()
  await db.modifiers.clear()
  await db.item_modifier_groups.clear()
  await db.dine_tables.clear()
  localStorage.clear()
  fromMock.mockReset()
})

describe('pullMerchantData', () => {
  it('caches the merchant, outlet, settings, staff, and menu locally', async () => {
    fromMock.mockImplementation(makeFromMock())

    const result = await pullMerchantData(MERCHANT_ID)

    expect(result.merchant).toEqual(merchant)
    expect(result.outlet).toEqual(outlet)
    expect(await db.merchants.get(MERCHANT_ID)).toEqual(merchant)
    expect(await db.outlets.get(OUTLET_ID)).toEqual(outlet)
    expect(await db.settings.get(OUTLET_ID)).toEqual(settings)
    expect(await db.staff.toArray()).toEqual(staff)
    expect(await db.categories.toArray()).toEqual(categories)
    expect(await db.items.toArray()).toEqual(items)
    expect(await db.modifier_groups.toArray()).toEqual(groups)
    expect(await db.modifiers.toArray()).toEqual(modifiers)
    expect(await db.item_modifier_groups.toArray()).toEqual(links)
    expect(await db.dine_tables.toArray()).toEqual(tables)
  })

  it('marks the pulled merchant/outlet as this device active session', async () => {
    fromMock.mockImplementation(makeFromMock())

    await pullMerchantData(MERCHANT_ID)

    expect(getActiveMerchantId()).toBe(MERCHANT_ID)
    expect(getActiveOutletId()).toBe(OUTLET_ID)
  })

  it('throws if the merchant has no outlet set up yet', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'merchants') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: merchant, error: null }) }) }),
        }
      }
      if (table === 'outlets') {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    await expect(pullMerchantData(MERCHANT_ID)).rejects.toThrow('no outlet set up yet')
  })

  it('propagates a Supabase read error', async () => {
    const readError = new Error('network error')
    fromMock.mockImplementation((table: string) => {
      if (table === 'merchants') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: null, error: readError }) }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }
    })

    await expect(pullMerchantData(MERCHANT_ID)).rejects.toBe(readError)
  })
})

describe('listMyMerchants', () => {
  it('unwraps the nested merchants row from user_merchants', async () => {
    fromMock.mockImplementation(() => ({
      select: async () => ({
        data: [{ merchants: merchant }, { merchants: { id: 'merchant-2', name: 'Other Shop' } }],
        error: null,
      }),
    }))

    const result = await listMyMerchants()
    expect(result).toEqual([merchant, { id: 'merchant-2', name: 'Other Shop' }])
  })

  it('returns an empty array when the user belongs to no merchant', async () => {
    fromMock.mockImplementation(() => ({ select: async () => ({ data: [], error: null }) }))

    expect(await listMyMerchants()).toEqual([])
  })

  it('propagates a Supabase read error', async () => {
    const readError = new Error('network error')
    fromMock.mockImplementation(() => ({ select: async () => ({ data: null, error: readError }) }))

    await expect(listMyMerchants()).rejects.toBe(readError)
  })
})
