import { describe, expect, it } from 'vitest'
import { computeBackoffMs } from './backoff'

describe('computeBackoffMs', () => {
  it('returns 0 when there have been no failures', () => {
    expect(computeBackoffMs(0)).toBe(0)
  })

  it('doubles the delay with each consecutive failure', () => {
    const d1 = computeBackoffMs(1)
    const d2 = computeBackoffMs(2)
    const d3 = computeBackoffMs(3)
    expect(d2).toBe(d1 * 2)
    expect(d3).toBe(d1 * 4)
  })

  it('caps the delay at 5 minutes', () => {
    expect(computeBackoffMs(100)).toBe(5 * 60 * 1000)
  })
})
