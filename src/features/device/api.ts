import { db } from '../../lib/db'
import { getActiveDeviceId, setActiveDeviceId } from '../../lib/localSession'
import { supabase } from '../../lib/supabase'
import type { Device } from '../../lib/types'
import { enqueue, isSyncDisabledForActiveMerchant } from '../sync/queue'

// Serializes concurrent calls onto the same in-flight attempt — without
// this, two near-simultaneous callers (e.g. React StrictMode's intentional
// double-invoke of effects in development) would both see no active device
// yet and each create one, leaving a duplicate.
let inFlight: Promise<Device> | null = null

/**
 * This browser's own cached device row, if it still matches the
 * merchant/outlet we're actually active on right now. The cached device id
 * can outlive the merchant/outlet it belonged to — e.g. "Reset this device"
 * (StaffLoginPage) clears the active merchant/outlet but not this device
 * row, and a later sign-in to a *different* shop on the same browser would
 * otherwise silently keep reusing it, producing orders whose device_id
 * belongs to the wrong merchant.
 */
export async function getCachedActiveDevice(
  merchantId: string,
  outletId: string,
): Promise<Device | null> {
  const existingId = getActiveDeviceId()
  if (!existingId) return null
  const existing = await db.devices.get(existingId)
  if (existing && existing.merchant_id === merchantId && existing.outlet_id === outletId) {
    return existing
  }
  return null
}

/**
 * Returns this browser's device row, creating one the first time it's
 * needed. There's no device-setup wizard yet (CLAUDE.md doesn't specify one)
 * — a device only matters for its receipt_prefix, used in order numbers
 * (section 7), so it's provisioned lazily here rather than during onboarding.
 */
export async function ensureActiveDevice(merchantId: string, outletId: string): Promise<Device> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const cached = await getCachedActiveDevice(merchantId, outletId)
      if (cached) return cached

      const deviceCount = await db.devices.where({ outlet_id: outletId }).count()
      const device: Device = {
        id: crypto.randomUUID(),
        merchant_id: merchantId,
        outlet_id: outletId,
        label: `Device ${deviceCount + 1}`,
        receipt_prefix: `D${deviceCount + 1}`,
        active: true,
      }

      await db.devices.put(device)
      await enqueue('devices', 'upsert', { ...device })
      setActiveDeviceId(device.id)

      return device
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/**
 * This outlet's other active devices, for the "which till is this?" picker
 * PosHome shows when a browser has no cached device of its own yet — lets
 * staff re-claim an existing till (e.g. after a reset, or a different
 * browser on the same counter) instead of always minting a new row, which
 * is what inflated platform-admin's device counts in the first place.
 * Supabase-only: this browser's own Dexie never has other browsers' device
 * rows. Basic-plan merchants never push devices to Supabase to begin with
 * (queue.ts's isSyncDisabledForActiveMerchant), so there's nothing to claim.
 */
export async function listClaimableDevices(outletId: string): Promise<Device[]> {
  if (await isSyncDisabledForActiveMerchant()) return []

  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('outlet_id', outletId)
    .eq('active', true)
    .order('label')
  if (error) throw error
  return data
}

/**
 * Adopts an existing device row as this browser's own, instead of creating
 * a new one. No Supabase write — the row already exists; this only caches
 * it locally. Intended for "this browser IS that till again" (a reset
 * tablet, a reinstalled browser), not for two browsers using the same till
 * at once: order numbers are generated from each browser's own local order
 * count for a device id (CLAUDE.md section 7), so two browsers sharing one
 * device id could mint colliding receipt numbers.
 */
export async function claimExistingDevice(device: Device): Promise<Device> {
  await db.devices.put(device)
  setActiveDeviceId(device.id)
  return device
}
