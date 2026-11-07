import type { SyncQueueItem } from '../../lib/types'

const MAX_ATTEMPTS_BEFORE_SKIP = 5

/** True once queue.ts has given up blocking the batch on this item — either it's classified permanent, or it's simply failed many times. */
export function isStuck(item: SyncQueueItem): boolean {
  return item.last_error_type === 'permanent' || item.attempts >= MAX_ATTEMPTS_BEFORE_SKIP
}
