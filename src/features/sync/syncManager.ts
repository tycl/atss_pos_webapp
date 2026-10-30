import { computeBackoffMs } from './backoff'
import { drainOnce, getPendingCount, onQueueChanged } from './queue'

const IDLE_POLL_MS = 30_000

export interface SyncManager {
  stop: () => void
}

/**
 * Drives the sync queue: drains when the browser comes back online, when a
 * new item is enqueued, and on a slow idle poll as a fallback. Backs off
 * exponentially after consecutive failures (CLAUDE.md section 8: "retries
 * with backoff; never loses data" — failed items stay queued, never dropped).
 */
export function startSyncManager(): SyncManager {
  let stopped = false
  let failCount = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function schedule(delayMs: number) {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void runLoop(), delayMs)
  }

  async function runLoop() {
    if (stopped) return

    try {
      if (!navigator.onLine) {
        schedule(IDLE_POLL_MS)
        return
      }

      const pending = await getPendingCount()
      if (pending === 0) {
        failCount = 0
        schedule(IDLE_POLL_MS)
        return
      }

      const { remaining } = await drainOnce()
      if (remaining === 0) {
        failCount = 0
        schedule(IDLE_POLL_MS)
      } else {
        failCount++
        schedule(computeBackoffMs(failCount))
      }
    } catch (err) {
      // An unexpected error here (e.g. Dexie unavailable) must not kill the
      // loop silently forever — section 8's "retries with backoff" promise
      // depends on always scheduling the next attempt.
      console.error('sync manager: unexpected error, will retry', err)
      failCount++
      schedule(computeBackoffMs(failCount))
    }
  }

  function handleOnline() {
    failCount = 0
    void runLoop()
  }

  function handleQueueChanged() {
    failCount = 0
    void runLoop()
  }

  window.addEventListener('online', handleOnline)
  const unsubscribeQueue = onQueueChanged(handleQueueChanged)
  void runLoop()

  return {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('online', handleOnline)
      unsubscribeQueue()
    },
  }
}
