import { supabase } from '../../lib/supabase'
import type { Device } from '../../lib/types'

/**
 * Owner-facing till management (Back office > Tills). Reads/writes Supabase
 * directly rather than local Dexie — unlike features/device/api.ts, which
 * only ever knows about this one browser's own claimed device, this needs
 * to see every device for the outlet regardless of which browser created
 * it (same reasoning as platform-admin/api.ts's listDevicesForMerchant).
 */
export async function listTillsForOutlet(outletId: string): Promise<Device[]> {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('outlet_id', outletId)
    .order('label')
  if (error) throw error
  return data
}

export async function renameTill(deviceId: string, label: string): Promise<Device> {
  const { data, error } = await supabase
    .from('devices')
    .update({ label })
    .eq('id', deviceId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function setTillActive(deviceId: string, active: boolean): Promise<Device> {
  const { data, error } = await supabase
    .from('devices')
    .update({ active })
    .eq('id', deviceId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Flags this till for a forced re-claim — picked up on its own next
 * heartbeat (features/device/heartbeat.ts), which clears its local binding
 * (so the "which till is this?" picker reappears there) and clears this
 * flag. Not instant: takes effect within one heartbeat interval.
 */
export async function requestForceReclaim(deviceId: string): Promise<Device> {
  const { data, error } = await supabase
    .from('devices')
    .update({ force_reclaim_requested_at: new Date().toISOString() })
    .eq('id', deviceId)
    .select()
    .single()
  if (error) throw error
  return data
}
