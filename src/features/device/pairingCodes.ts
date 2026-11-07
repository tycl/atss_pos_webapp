import { hashPin, verifyPin } from '../../lib/pin'
import { supabase } from '../../lib/supabase'
import type { Device } from '../../lib/types'

const CODE_EXPIRY_MS = 10 * 60_000

function generateSixDigitCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return n.toString().padStart(6, '0')
}

/**
 * Generates a single-use, 10-minute pairing code for one till, for an owner
 * to read off-screen to whoever is setting up the new browser (Back office
 * Tills page). The code is hashed with the same scheme as staff PINs
 * (lib/pin.ts) before it's stored — this function is the only place the
 * plaintext ever exists; it's never stored or retrievable again.
 */
export async function generatePairingCode(
  merchantId: string,
  outletId: string,
  deviceId: string,
): Promise<{ code: string; expiresAt: string }> {
  const code = generateSixDigitCode()
  const codeHash = await hashPin(code)
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS).toISOString()

  const { error } = await supabase.from('device_pairing_codes').insert({
    merchant_id: merchantId,
    outlet_id: outletId,
    device_id: deviceId,
    code_hash: codeHash,
    expires_at: expiresAt,
  })
  if (error) throw error

  return { code, expiresAt }
}

/**
 * Redeems a pairing code entered on a new browser (ClaimDeviceModal),
 * resolving it to the till it was generated for. Only considers codes that
 * are unused and unexpired; iterates and compares with verifyPin since each
 * row's hash has its own salt (same idiom as staff/api.ts's PIN checks).
 * Marks the matched code used so it can't be redeemed again. Never reveals
 * *why* a code didn't match (wrong digits vs expired vs already used) —
 * just that it's invalid.
 */
export async function redeemPairingCode(
  merchantId: string,
  outletId: string,
  code: string,
): Promise<Device> {
  const { data: candidates, error } = await supabase
    .from('device_pairing_codes')
    .select('id, code_hash, device_id')
    .eq('merchant_id', merchantId)
    .eq('outlet_id', outletId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error

  for (const candidate of candidates) {
    if (await verifyPin(code, candidate.code_hash)) {
      const { error: updateError } = await supabase
        .from('device_pairing_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', candidate.id)
      if (updateError) throw updateError

      const { data: device, error: deviceError } = await supabase
        .from('devices')
        .select('*')
        .eq('id', candidate.device_id)
        .single()
      if (deviceError) throw deviceError
      return device
    }
  }

  throw new Error('Invalid or expired code')
}

/**
 * Thin orchestration ClaimDeviceModal's pairing-code form calls on submit —
 * pulled out of the component so it's unit-testable without rendering
 * (this project has no established pattern for testing component internals
 * with React Testing Library; plain functions are tested directly instead).
 */
export async function submitPairingCode(
  merchantId: string,
  outletId: string,
  code: string,
  callbacks: { onSuccess: (device: Device) => void; onError: (message: string) => void },
): Promise<void> {
  try {
    const device = await redeemPairingCode(merchantId, outletId, code)
    callbacks.onSuccess(device)
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : 'Invalid or expired code')
  }
}
