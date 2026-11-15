import { useEffect, useState } from 'react'
import type { Device } from '../../lib/types'
import { useOnlineStatus } from '../sync/useOnlineStatus'
import {
  claimExistingDevice,
  ensureActiveDevice,
  getCachedActiveDevice,
  invalidateDeviceBinding,
  listClaimableDevices,
} from './api'
import { startDeviceHeartbeat } from './heartbeat'

export interface UseActiveDeviceResult {
  device: Device | null
  deviceError: string | null
  // Non-null while waiting for the caller to show a "which till is this?"
  // picker and call chooseExisting/chooseNew.
  claimableDevices: Device[] | null
  chooseExisting: (device: Device) => void
  chooseNew: () => void
  // True while another browser's heartbeat for this same till looks recent
  // — informational only, never blocks placing orders (see
  // DeviceCollisionBanner).
  collision: boolean
}

/**
 * Resolves which device this browser is for the given merchant/outlet.
 * Reuses an already-cached device silently. When there's no cache but other
 * active devices already exist for this outlet (and we're online, so they
 * can actually be seen), pauses with claimableDevices set instead of always
 * minting a new device row — the fix for platform-admin's inflated device
 * counts. Falls straight through to creating a new device when offline, on
 * a Basic plan, or when this is genuinely the first till for this outlet.
 */
export function useActiveDevice(
  merchantId: string | null,
  outletId: string | null,
  staffId: string | null = null,
): UseActiveDeviceResult {
  const isOnline = useOnlineStatus()
  const [device, setDevice] = useState<Device | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [claimableDevices, setClaimableDevices] = useState<Device[] | null>(null)
  const [collision, setCollision] = useState(false)
  // Bumped to force the resolution effect below to re-run after a
  // force-reclaim, since `device` itself isn't one of its dependencies.
  const [resolutionTrigger, setResolutionTrigger] = useState(0)

  useEffect(() => {
    if (!merchantId || !outletId) return
    let cancelled = false

    void (async () => {
      try {
        const cached = await getCachedActiveDevice(merchantId, outletId)
        if (cached) {
          if (!cancelled) setDevice(cached)
          return
        }

        if (isOnline) {
          const candidates = await listClaimableDevices(outletId)
          if (candidates.length > 0) {
            if (!cancelled) setClaimableDevices(candidates)
            return
          }
        }

        const created = await ensureActiveDevice(merchantId, outletId)
        if (!cancelled) setDevice(created)
      } catch (err) {
        if (!cancelled) {
          setDeviceError(err instanceof Error ? err.message : 'Could not set up this device')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [merchantId, outletId, isOnline, resolutionTrigger])

  useEffect(() => {
    if (!device || !outletId) return

    const handle = startDeviceHeartbeat(
      device,
      outletId,
      staffId,
      setCollision,
      (unsyncedCount: number) => {
        setDevice(null)
        setCollision(false)
        if (unsyncedCount > 0) {
          setDeviceError(
            `This till was reclaimed. ${unsyncedCount} unsent record${unsyncedCount !== 1 ? 's are' : ' is'} saved locally and will sync when this browser goes online.`,
          )
        }
        setResolutionTrigger((n) => n + 1)
      },
      () => {
        // Atomic claim rejected — another session is actively using this till.
        // Invalidate the local binding so the resolution effect doesn't
        // immediately re-select it, and surface a blocking error.
        void invalidateDeviceBinding(outletId)
        setDevice(null)
        setCollision(false)
        setDeviceError(
          'Another browser is actively using this till. Use Force Re-claim from Back office › Tills to take it over.',
        )
      },
    )

    return () => handle.stop()
    // staffId intentionally omitted from deps: changing who's logged in
    // shouldn't restart the heartbeat, and the audit entry captures whoever
    // was active when the reclaim happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, outletId])

  function chooseExisting(chosen: Device) {
    setClaimableDevices(null)
    claimExistingDevice(chosen)
      .then(setDevice)
      .catch((err) => {
        setDeviceError(err instanceof Error ? err.message : 'Could not use that till')
      })
  }

  function chooseNew() {
    if (!merchantId || !outletId) return
    setClaimableDevices(null)
    ensureActiveDevice(merchantId, outletId)
      .then(setDevice)
      .catch((err) => {
        setDeviceError(err instanceof Error ? err.message : 'Could not set up this device')
      })
  }

  return { device, deviceError, claimableDevices, chooseExisting, chooseNew, collision }
}
