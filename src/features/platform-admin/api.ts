import { supabase } from '../../lib/supabase'
import type { Merchant, MerchantPlan, MerchantStatus } from '../../lib/types'

export interface MerchantWithCounts extends Merchant {
  outletCount: number
  deviceCount: number
}

/** Whether the signed-in Supabase Auth user is the platform admin (see the `platform_admins` table/RLS). */
export async function isCurrentUserPlatformAdmin(): Promise<boolean> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return false

  const { data, error } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', sessionData.session.user.id)
    .maybeSingle()
  if (error) throw error
  return data !== null
}

/**
 * Every merchant plus its outlet/device counts, for the admin dashboard.
 * RLS-gated to `is_platform_admin()` — see
 * supabase/migrations/20261103000000_merchant_plan_and_platform_admin.sql.
 */
export async function listMerchantsWithCounts(): Promise<MerchantWithCounts[]> {
  const { data: merchants, error: merchantsError } = await supabase
    .from('merchants')
    .select('*')
    .order('name')
  if (merchantsError) throw merchantsError

  const { data: outlets, error: outletsError } = await supabase
    .from('outlets')
    .select('merchant_id')
  if (outletsError) throw outletsError

  const { data: devices, error: devicesError } = await supabase
    .from('devices')
    .select('merchant_id')
  if (devicesError) throw devicesError

  return merchants.map((merchant) => ({
    ...merchant,
    outletCount: outlets.filter((o) => o.merchant_id === merchant.id).length,
    deviceCount: devices.filter((d) => d.merchant_id === merchant.id).length,
  }))
}

export interface UpdateMerchantSubscriptionInput {
  plan: MerchantPlan
  status: MerchantStatus
  subscription_started_at: string | null
  subscription_expires_at: string | null
}

export async function updateMerchantSubscription(
  merchantId: string,
  input: UpdateMerchantSubscriptionInput,
): Promise<Merchant> {
  const { data, error } = await supabase
    .from('merchants')
    .update(input)
    .eq('id', merchantId)
    .select()
    .single()
  if (error) throw error
  return data
}
