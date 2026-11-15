import { db } from '../../lib/db'
import { supabase, supabaseAnonKey, supabaseUrl } from '../../lib/supabase'
import type { AuditLog, Device } from '../../lib/types'
import { drainOnce, enqueue, getPendingCountForDevice } from '../sync/queue'
import { getActiveShift, forceCloseShift } from '../shift/api'
import { invalidateDeviceBinding } from './api'

export const HEARTBEAT_INTERVAL_MS = 60_000
// Product decision: "within last 2-3 min" — chosen at the low end so the
// warning clears promptly once the other session actually goes away.
export const COLLISION_WINDOW_MS = 2 * 60_000

export interface HeartbeatHandle {
  sessionId: string
  stop: () => void
}

interface ClaimResult {
  status: 'claimed' | 'conflict' | 'not_found'
}

/**
 * Keeps devices.last_seen_at/session_id/user_agent current for a claimed
 * till while its tab is open, reports a non-blocking collision when another
 * session heartbeated the same row recently, and reacts to an owner-
 * initiated force-reclaim (Back office Tills page) by clearing this
 * browser's local binding so the "which till is this?" flow reappears.
 *
 * The first beat attempts an atomic claim via the `claim_pos_till` RPC
 * (CLAUDE.md section 12a) — if another session is actively using this
 * device, the claim is rejected and `onClaimRejected` fires. When the
 * RPC is unavailable (offline, migration not applied), falls back to
 * the legacy read-then-write first beat.
 *
 * Best-effort: a failed beat is swallowed and simply retried next tick —
 * this is presence telemetry, not business data, so it never goes through
 * the sync queue (CLAUDE.md section 8's durability guarantees don't apply
 * to it, and shouldn't: a stale last_seen_at self-corrects on its own).
 */
export function startDeviceHeartbeat(
  device: Device,
  outletId: string,
  staffId: string | null,
  onCollision: (collision: boolean) => void,
  onForceReclaimed: (unsyncedCount: number) => void,
  onClaimRejected: () => void,
  // Overridable so tests can use a short real interval instead of mocking
  // setInterval with fake timers, which don't play well with this app's
  // real (fake-indexeddb-backed) Dexie calls in invalidateDeviceBinding.
  intervalMs: number = HEARTBEAT_INTERVAL_MS,
): HeartbeatHandle {
  const sessionId = crypto.randomUUID()
  let stopped = false
  let intervalId: ReturnType<typeof setInterval> | null = null

  async function beat() {
    if (stopped) return

    try {
      const { data, error } = await supabase
        .from('devices')
        .select('session_id, last_seen_at, force_reclaim_requested_at')
        .eq('id', device.id)
        .maybeSingle()
      if (error) throw error

      if (data) {
        const otherSessionRecent =
          Boolean(data.session_id) &&
          data.session_id !== sessionId &&
          Boolean(data.last_seen_at) &&
          Date.now() - new Date(data.last_seen_at as string).getTime() < COLLISION_WINDOW_MS
        onCollision(otherSessionRecent)

        if (data.force_reclaim_requested_at) {
          // Close any open shift before losing the till binding
          // (CLAUDE.md section 12c).
          let closedShiftId: string | null = null
          try {
            const activeShift = await getActiveShift(device.id)
            if (activeShift) {
              await forceCloseShift(activeShift.id)
              closedShiftId = activeShift.id
            }
          } catch (err) {
            console.error('device heartbeat: could not force-close shift during reclaim', err)
          }

          // Audit trail (CLAUDE.md section 12c).
          try {
            const auditEntry: AuditLog = {
              id: crypto.randomUUID(),
              merchant_id: device.merchant_id,
              staff_id: staffId ?? device.merchant_id,
              action: 'force_reclaim_executed',
              details: {
                device_id: device.id,
                device_label: device.label,
                previous_session_id: data.session_id,
                new_session_id: sessionId,
                shift_id: closedShiftId,
                shift_closed: closedShiftId !== null,
              },
              created_at: new Date().toISOString(),
            }
            await db.audit_log.put(auditEntry)
            await enqueue('audit_log', 'upsert', { ...auditEntry })
          } catch (err) {
            console.error('device heartbeat: could not write force-reclaim audit entry', err)
          }

          // Best-effort flush: push any queued writes before losing the till.
          let unsyncedCount = 0
          try {
            await drainOnce()
          } catch {
            // Drain failure is non-fatal — count what's left.
          }
          try {
            unsyncedCount = await getPendingCountForDevice(device.id)
          } catch {
            // Non-fatal.
          }

          await invalidateDeviceBinding(outletId)
          onForceReclaimed(unsyncedCount)
          await supabase
            .from('devices')
            .update({ force_reclaim_requested_at: null })
            .eq('id', device.id)
          return
        }
      }

      if (stopped) return
      await supabase
        .from('devices')
        .update({
          last_seen_at: new Date().toISOString(),
          session_id: sessionId,
          user_agent: navigator.userAgent,
        })
        .eq('id', device.id)

      // Refresh the cached auth token so beforeunload/visibilitychange
      // always has a valid token (Supabase sessions auto-refresh but the
      // cached string would go stale after ~1 hour without this).
      const { data: sessionData } = await supabase.auth.getSession()
      cachedAccessToken = sessionData.session?.access_token ?? null
    } catch (err) {
      console.error('device heartbeat: beat failed', err)
    }
  }

  async function start() {
    if (stopped) return

    // Atomic claim on first beat — prevents two browsers from using
    // the same device simultaneously (CLAUDE.md section 12a).
    try {
      const { data, error } = await supabase.rpc('claim_pos_till', {
        p_device_id: device.id,
        p_session_id: sessionId,
        p_user_agent: navigator.userAgent,
      })
      if (error) throw error

      const result = data as ClaimResult
      if (result.status === 'conflict') {
        onClaimRejected()
        return
      }

      onCollision(false)
      if (stopped) return
      intervalId = setInterval(() => void beat(), intervalMs)
      return
    } catch {
      // RPC unavailable (offline, function not deployed yet, etc.)
      // — fall through to legacy first-beat behavior.
    }

    await beat()
    if (stopped) return
    intervalId = setInterval(() => void beat(), intervalMs)
  }

  // Cached auth token for sendBeacon (refreshed each periodic beat so it
  // stays current even if the tab sits open for hours).
  let cachedAccessToken: string | null = null
  void supabase.auth.getSession().then(({ data }) => {
    cachedAccessToken = data.session?.access_token ?? null
  })

  function sendRelease() {
    if (!cachedAccessToken) return
    // fetch with keepalive survives page unload and supports custom
    // headers (sendBeacon cannot carry auth headers).
    try {
      void fetch(`${supabaseUrl}/rest/v1/rpc/release_pos_till`, {
        method: 'POST',
        body: JSON.stringify({ p_device_id: device.id, p_session_id: sessionId }),
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${cachedAccessToken}`,
        },
        keepalive: true,
      })
    } catch {
      // Best-effort: tab is closing, nothing we can do if this fails.
    }
  }

  function handleBeforeUnload() {
    sendRelease()
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') sendRelease()
  }

  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  void start()

  return {
    sessionId,
    stop: () => {
      stopped = true
      if (intervalId !== null) clearInterval(intervalId)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      // Explicit release via regular async (still have execution context
      // in React cleanup).
      void supabase.rpc('release_pos_till', {
        p_device_id: device.id,
        p_session_id: sessionId,
      })
    },
  }
}
