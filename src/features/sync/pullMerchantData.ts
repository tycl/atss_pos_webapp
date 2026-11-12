import { db } from '../../lib/db'
import { setActiveMerchantId, setActiveOutletId } from '../../lib/localSession'
import { supabase } from '../../lib/supabase'
import type { Merchant, Outlet } from '../../lib/types'

/**
 * Which merchant(s) the signed-in Supabase Auth user belongs to (via
 * `user_merchants`). Used on a device that has no merchant cached locally
 * yet — e.g. after "Reset this device" — to let an existing owner log back
 * into a shop they already have, instead of always creating a new one.
 */
export async function listMyMerchants(): Promise<Merchant[]> {
  const { data, error } = await supabase.from('user_merchants').select('merchants(*)')
  if (error) throw error
  return (data ?? []).map((row) => row.merchants as unknown as Merchant)
}

/**
 * Pulls one merchant's full setup down from Supabase into this device's
 * local Dexie cache, then marks it as this device's active merchant/outlet
 * (CLAUDE.md section 8: "menu and settings are pulled from the cloud and
 * cached locally").
 *
 * All outlets (and their per-outlet settings/tables) are pulled so the
 * owner can switch between branches offline. The first outlet is set as
 * the active one by default.
 *
 * Historical orders/payments/shifts are not pulled — a freshly attached
 * device starts with an empty order history, same as a brand-new shop.
 */
export async function pullMerchantData(merchantId: string): Promise<{
  merchant: Merchant
  outlets: Outlet[]
  activeOutlet: Outlet
}> {
  const [merchantRes, outletsRes] = await Promise.all([
    supabase.from('merchants').select().eq('id', merchantId).single(),
    supabase.from('outlets').select().eq('merchant_id', merchantId).order('name'),
  ])
  if (merchantRes.error) throw merchantRes.error
  if (outletsRes.error) throw outletsRes.error

  const merchant = merchantRes.data as Merchant
  const outlets = (outletsRes.data ?? []) as Outlet[]
  if (outlets.length === 0) throw new Error('This shop has no outlet set up yet')

  const outletIds = outlets.map((o) => o.id)
  const [
    settingsRes,
    staffRes,
    categoriesRes,
    itemsRes,
    groupsRes,
    modifiersRes,
    linksRes,
    tablesRes,
  ] = await Promise.all([
    supabase.from('settings').select().in('outlet_id', outletIds),
    supabase.from('staff').select().eq('merchant_id', merchantId),
    supabase.from('categories').select().eq('merchant_id', merchantId),
    supabase.from('items').select().eq('merchant_id', merchantId),
    supabase.from('modifier_groups').select().eq('merchant_id', merchantId),
    supabase.from('modifiers').select().eq('merchant_id', merchantId),
    supabase.from('item_modifier_groups').select().eq('merchant_id', merchantId),
    supabase.from('tables').select().in('outlet_id', outletIds),
  ])
  for (const res of [
    settingsRes,
    staffRes,
    categoriesRes,
    itemsRes,
    groupsRes,
    modifiersRes,
    linksRes,
    tablesRes,
  ]) {
    if (res.error) throw res.error
  }

  await db.merchants.put(merchant)
  await db.outlets.bulkPut(outlets)
  if (settingsRes.data?.length) await db.settings.bulkPut(settingsRes.data)
  if (staffRes.data?.length) await db.staff.bulkPut(staffRes.data)
  if (categoriesRes.data?.length) await db.categories.bulkPut(categoriesRes.data)
  if (itemsRes.data?.length) await db.items.bulkPut(itemsRes.data)
  if (groupsRes.data?.length) await db.modifier_groups.bulkPut(groupsRes.data)
  if (modifiersRes.data?.length) await db.modifiers.bulkPut(modifiersRes.data)
  if (linksRes.data?.length) await db.item_modifier_groups.bulkPut(linksRes.data)
  if (tablesRes.data?.length) await db.dine_tables.bulkPut(tablesRes.data)

  const activeOutlet = outlets[0]
  setActiveMerchantId(merchant.id)
  setActiveOutletId(activeOutlet.id)

  return { merchant, outlets, activeOutlet }
}
