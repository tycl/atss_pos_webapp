import { db } from '../../lib/db'
import {
  clearDeviceIdForOutlet,
  getActiveDeviceId,
  getDeviceIdForOutlet,
  setDeviceIdForOutlet,
} from '../../lib/localSession'
import { supabase } from '../../lib/supabase'
import type { Device } from '../../lib/types'
import { enqueue, isSyncDisabledForActiveMerchant } from '../sync/queue'

// Serializes concurrent calls onto the same in-flight attempt — without
// this, two near-simultaneous callers (e.g. React StrictMode's intentional
// double-invoke of effects in development) would both see no active device
// yet and each create one, leaving a duplicate.
let inFlight: Promise<Device> | null = null

/**
 * The device id this browser believes it's bound to for an outlet, checked
 * in order of durability: the per-outlet localStorage key, then the
 * `device_bindings` Dexie table (survives if just the localStorage key was
 * evicted), then a one-time fallback to the old single global key (from
 * before per-outlet binding existed). Returns a candidate id only — the
 * caller still has to verify it against an actual device row.
 */
async function readDeviceBinding(outletId: string): Promise<string | null> {
  const fromLocalStorage = getDeviceIdForOutlet(outletId)
  if (fromLocalStorage) return fromLocalStorage

  const fromDexie = await db.device_bindings.get(outletId)
  if (fromDexie) return fromDexie.device_id

  return getActiveDeviceId()
}

/** Persists this outlet's device binding redundantly in both localStorage and IndexedDB. */
async function writeDeviceBinding(outletId: string, deviceId: string): Promise<void> {
  setDeviceIdForOutlet(outletId, deviceId)
  await db.device_bindings.put({ outlet_id: outletId, device_id: deviceId })
}

/** Clears this outlet's device binding from both localStorage and IndexedDB. */
export async function invalidateDeviceBinding(outletId: string): Promise<void> {
  clearDeviceIdForOutlet(outletId)
  await db.device_bindings.delete(outletId)
}

/**
 * This browser's own cached device row, if it still matches the
 * merchant/outlet we're actually active on right now and hasn't been
 * deactivated. The cached device id can outlive the merchant/outlet it
 * belonged to — e.g. "Reset this device" (StaffLoginPage) clears the active
 * merchant/outlet but not this device row, and a later sign-in to a
 * *different* shop on the same browser would otherwise silently keep
 * reusing it, producing orders whose device_id belongs to the wrong
 * merchant — so a mismatch here just returns null (not invalidated; it may
 * still be valid for whatever outlet it does belong to).
 */
export async function getCachedActiveDevice(
  merchantId: string,
  outletId: string,
): Promise<Device | null> {
  const existingId = await readDeviceBinding(outletId)
  if (!existingId) return null

  let existing = await db.devices.get(existingId)

  // Not cached locally yet — e.g. bound via a pairing code redeemed on a
  // different screen, or this browser's devices table lost the row while
  // the binding pointer itself survived. Look it up directly rather than
  // falling through to "no device", which would otherwise mint a brand new
  // one unnecessarily.
  if (!existing && navigator.onLine) {
    const { data } = await supabase.from('devices').select('*').eq('id', existingId).maybeSingle()
    if (data) existing = data
  }

  if (!existing) return null
  if (existing.merchant_id !== merchantId || existing.outlet_id !== outletId) return null

  if (!existing.active) {
    await invalidateDeviceBinding(outletId)
    return null
  }

  await db.devices.put(existing)
  await writeDeviceBinding(outletId, existing.id)
  return existing
}

/**
 * The next `D{n}` receipt prefix not already used by a device this browser
 * knows about for this outlet. Local-Dexie-only, so it's fully offline-
 * capable, but it can't see prefixes only known to *other* browsers — the
 * devices_outlet_receipt_prefix_unique DB constraint catches that residual
 * race, and the sync queue auto-recovers from it (see queue.ts).
 */
async function nextFreeReceiptPrefix(outletId: string): Promise<string> {
  const existing = await db.devices.where({ outlet_id: outletId }).toArray()
  const usedPrefixes = new Set(existing.map((device) => device.receipt_prefix))
  let n = 1
  while (usedPrefixes.has(`D${n}`)) n++
  return `D${n}`
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
      const receiptPrefix = await nextFreeReceiptPrefix(outletId)
      const device: Device = {
        id: crypto.randomUUID(),
        merchant_id: merchantId,
        outlet_id: outletId,
        label: `Device ${deviceCount + 1}`,
        receipt_prefix: receiptPrefix,
        active: true,
      }

      await db.devices.put(device)
      await enqueue('devices', 'upsert', { ...device })
      await writeDeviceBinding(outletId, device.id)

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
  await writeDeviceBinding(device.outlet_id, device.id)
  return device
}
