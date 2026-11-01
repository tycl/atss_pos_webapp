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
 * Pulls one merchant's setup down from Supabase into this device's local
 * Dexie cache, then marks it as this device's active merchant/outlet
 * (CLAUDE.md section 8: "menu and settings are pulled from the cloud and
 * cached locally"). This is the first cloud -> device sync path in the
 * app — until now, data only ever flowed device -> cloud.
 *
 * MVP limitation: only the merchant's first outlet is pulled. Multi-outlet
 * merchants aren't supported by onboarding either, so this matches that.
 * Historical orders/payments/shifts are not pulled — a freshly attached
 * device starts with an empty order history, same as a brand-new shop.
 */
export async function pullMerchantData(merchantId: string): Promise<{
  merchant: Merchant
  outlet: Outlet
}> {
  const [merchantRes, outletsRes] = await Promise.all([
    supabase.from('merchants').select().eq('id', merchantId).single(),
    supabase.from('outlets').select().eq('merchant_id', merchantId).order('name'),
  ])
  if (merchantRes.error) throw merchantRes.error
  if (outletsRes.error) throw outletsRes.error

  const merchant = merchantRes.data as Merchant
  const outlets = (outletsRes.data ?? []) as Outlet[]
  const outlet = outlets[0]
  if (!outlet) throw new Error('This shop has no outlet set up yet')

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
    supabase.from('settings').select().eq('outlet_id', outlet.id).maybeSingle(),
    supabase.from('staff').select().eq('merchant_id', merchantId),
    supabase.from('categories').select().eq('merchant_id', merchantId),
    supabase.from('items').select().eq('merchant_id', merchantId),
    supabase.from('modifier_groups').select().eq('merchant_id', merchantId),
    supabase.from('modifiers').select().eq('merchant_id', merchantId),
    supabase.from('item_modifier_groups').select().eq('merchant_id', merchantId),
    supabase.from('tables').select().eq('outlet_id', outlet.id),
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
  await db.outlets.put(outlet)
  if (settingsRes.data) await db.settings.put(settingsRes.data)
  if (staffRes.data?.length) await db.staff.bulkPut(staffRes.data)
  if (categoriesRes.data?.length) await db.categories.bulkPut(categoriesRes.data)
  if (itemsRes.data?.length) await db.items.bulkPut(itemsRes.data)
  if (groupsRes.data?.length) await db.modifier_groups.bulkPut(groupsRes.data)
  if (modifiersRes.data?.length) await db.modifiers.bulkPut(modifiersRes.data)
  if (linksRes.data?.length) await db.item_modifier_groups.bulkPut(linksRes.data)
  if (tablesRes.data?.length) await db.dine_tables.bulkPut(tablesRes.data)

  setActiveMerchantId(merchant.id)
  setActiveOutletId(outlet.id)

  return { merchant, outlet }
}
