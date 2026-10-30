import { db } from '../../lib/db'
import { getActiveDeviceId, setActiveDeviceId } from '../../lib/localSession'
import type { Device } from '../../lib/types'
import { enqueue } from '../sync/queue'

// Serializes concurrent calls onto the same in-flight attempt — without
// this, two near-simultaneous callers (e.g. React StrictMode's intentional
// double-invoke of effects in development) would both see no active device
// yet and each create one, leaving a duplicate.
let inFlight: Promise<Device> | null = null

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
      const existingId = getActiveDeviceId()
      if (existingId) {
        const existing = await db.devices.get(existingId)
        if (existing) return existing
      }

      const deviceCount = await db.devices.where({ outlet_id: outletId }).count()
      const device: Device = {
        id: crypto.randomUUID(),
        merchant_id: merchantId,
        outlet_id: outletId,
        label: `Device ${deviceCount + 1}`,
        receipt_prefix: `D${deviceCount + 1}`,
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
