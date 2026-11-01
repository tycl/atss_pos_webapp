import { db } from '../../lib/db'
import { setActiveMerchantId, setActiveOutletId } from '../../lib/localSession'
import { hashPin } from '../../lib/pin'
import { supabase } from '../../lib/supabase'
import type { Settings, Staff, StaffRole } from '../../lib/types'
import { enqueue } from '../sync/queue'

export async function signUpOwner(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
}

export async function signInOwner(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export interface CreateMerchantInput {
  merchantName: string
  outletName: string
  ssmNo?: string
  sstNo?: string
  merchantAddress?: string
  merchantPhone?: string
  outletAddress?: string
}

/**
 * Creates the merchant + its first outlet + default settings. Requires an
 * authenticated Supabase session (the owner from signUpOwner/signInOwner) —
 * onboarding is inherently an online, one-time step. Caches the merchant and
 * outlet locally so this device is now "signed in" to that merchant.
 */
export async function createMerchantWithOutlet(input: CreateMerchantInput) {
  // Insert and read back as two requests: chaining .select() onto the insert
  // makes Postgres check the merchants SELECT policy before the
  // link_owner_to_new_merchant trigger has granted membership, which fails
  // with 42501. Generating the id here is what lets us find the row afterwards.
  const merchantId = crypto.randomUUID()
  const { error: merchantError } = await supabase.from('merchants').insert({
    id: merchantId,
    name: input.merchantName,
    ssm_no: input.ssmNo ?? null,
    sst_no: input.sstNo ?? null,
    address: input.merchantAddress ?? null,
    phone: input.merchantPhone ?? null,
  })
  if (merchantError) throw merchantError

  const { data: merchant, error: merchantReadError } = await supabase
    .from('merchants')
    .select()
    .eq('id', merchantId)
    .single()
  if (merchantReadError) throw merchantReadError

  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .insert({
      merchant_id: merchant.id,
      name: input.outletName,
      address: input.outletAddress ?? null,
    })
    .select()
    .single()
  if (outletError) throw outletError

  const defaultSettings: Settings = {
    outlet_id: outlet.id,
    merchant_id: merchant.id,
    sst_enabled: false,
    sst_rate_bp: 0,
    service_charge_enabled: false,
    service_charge_rate_bp: 0,
    cash_rounding_enabled: false,
    duitnow_qr_url: null,
    print_bridge_url: null,
  }

  const { error: settingsError } = await supabase.from('settings').insert(defaultSettings)
  if (settingsError) throw settingsError

  await db.merchants.put(merchant)
  await db.outlets.put(outlet)
  await db.settings.put(defaultSettings)

  setActiveMerchantId(merchant.id)
  setActiveOutletId(outlet.id)

  return { merchant, outlet }
}

export interface CreateStaffInput {
  merchantId: string
  name: string
  role: StaffRole
  pin: string
}

/**
 * Creates a staff member with a hashed PIN. Writes to Dexie first (CLAUDE.md
 * section 8's "every write goes to Dexie first"), then queues the push to
 * Supabase — works offline, and the queue retries with backoff once online.
 */
export async function createStaffMember(input: CreateStaffInput): Promise<Staff> {
  const pinHash = await hashPin(input.pin)
  const staff: Staff = {
    id: crypto.randomUUID(),
    merchant_id: input.merchantId,
    name: input.name,
    role: input.role,
    pin_hash: pinHash,
    active: true,
  }

  await db.staff.put(staff)
  await enqueue('staff', 'upsert', { ...staff })

  return staff
}
