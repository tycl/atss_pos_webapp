import { describe, expect, it } from 'vitest'
import { nextSeq } from './sequence'

describe('nextSeq', () => {
  it('is strictly increasing across many rapid calls', () => {
    const values = Array.from({ length: 500 }, () => nextSeq())
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1])
    }
  })

  it('stays close to the current time in milliseconds', () => {
    const before = Date.now()
    const seq = nextSeq()
    const after = Date.now()
    expect(Math.floor(seq / 1000)).toBeGreaterThanOrEqual(before)
    expect(Math.floor(seq / 1000)).toBeLessThanOrEqual(after)
  })
})
