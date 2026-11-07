import { describe, expect, it } from 'vitest'
import type { SyncQueueItem } from '../../lib/types'
import { isStuck } from './syncIssueStatus'

function makeItem(overrides: Partial<SyncQueueItem>): SyncQueueItem {
  return {
    id: 'item-1',
    table: 'orders',
    op: 'upsert',
    payload: {},
    created_at: new Date().toISOString(),
    seq: 1,
    attempts: 0,
    last_error: null,
    ...overrides,
  }
}

describe('isStuck', () => {
  it('is false for a fresh item that has never failed', () => {
    expect(isStuck(makeItem({ attempts: 0 }))).toBe(false)
  })

  it('is false for an item that has failed a few times but isn’t classified permanent', () => {
    expect(isStuck(makeItem({ attempts: 2, last_error_type: 'transient' }))).toBe(false)
  })

  it('is true for an item classified permanent, even on its first failure', () => {
    expect(isStuck(makeItem({ attempts: 1, last_error_type: 'permanent' }))).toBe(true)
  })

  it('is true once attempts reaches the skip threshold, regardless of classification', () => {
    expect(isStuck(makeItem({ attempts: 5, last_error_type: 'transient' }))).toBe(true)
  })
})
