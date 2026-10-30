const BASE_DELAY_MS = 2000
const MAX_DELAY_MS = 5 * 60 * 1000

/** Exponential backoff after `failCount` consecutive failed drain attempts, capped at 5 minutes. */
export function computeBackoffMs(failCount: number): number {
  if (failCount <= 0) return 0
  return Math.min(BASE_DELAY_MS * 2 ** (failCount - 1), MAX_DELAY_MS)
}
