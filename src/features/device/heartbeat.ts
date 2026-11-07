import { supabase } from '../../lib/supabase'
import type { Device } from '../../lib/types'
import { invalidateDeviceBinding } from './api'

export const HEARTBEAT_INTERVAL_MS = 60_000
// Product decision: "within last 2-3 min" — chosen at the low end so the
// warning clears promptly once the other session actually goes away.
export const COLLISION_WINDOW_MS = 2 * 60_000

export interface HeartbeatHandle {
  stop: () => void
}

/**
 * Keeps devices.last_seen_at/session_id/user_agent current for a claimed
 * till while its tab is open, reports a non-blocking collision when another
 * session heartbeated the same row recently, and reacts to an owner-
 * initiated force-reclaim (Back office Tills page) by clearing this
 * browser's local binding so the "which till is this?" flow reappears.
 * Best-effort: a failed beat is swallowed and simply retried next tick —
 * this is presence telemetry, not business data, so it never goes through
 * the sync queue (CLAUDE.md section 8's durability guarantees don't apply
 * to it, and shouldn't: a stale last_seen_at self-corrects on its own).
 */
export function startDeviceHeartbeat(
  device: Device,
  outletId: string,
  onCollision: (collision: boolean) => void,
  onForceReclaimed: () => void,
  // Overridable so tests can use a short real interval instead of mocking
  // setInterval with fake timers, which don't play well with this app's
  // real (fake-indexeddb-backed) Dexie calls in invalidateDeviceBinding.
  intervalMs: number = HEARTBEAT_INTERVAL_MS,
): HeartbeatHandle {
  const sessionId = crypto.randomUUID()
  let stopped = false

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
          await invalidateDeviceBinding(outletId)
          onForceReclaimed()
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
    } catch (err) {
      console.error('device heartbeat: beat failed', err)
    }
  }

  void beat()
  const intervalId = setInterval(() => void beat(), intervalMs)

  return {
    stop: () => {
      stopped = true
      clearInterval(intervalId)
    },
  }
}
