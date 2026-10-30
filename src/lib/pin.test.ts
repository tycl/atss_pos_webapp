import { describe, expect, it } from 'vitest'
import { hashPin, verifyPin } from './pin'

describe('hashPin / verifyPin', () => {
  it('verifies a correct PIN against its own hash', async () => {
    const stored = await hashPin('1234')
    expect(await verifyPin('1234', stored)).toBe(true)
  })

  it('rejects an incorrect PIN', async () => {
    const stored = await hashPin('1234')
    expect(await verifyPin('9999', stored)).toBe(false)
  })

  it('produces a different hash each time (random salt)', async () => {
    const a = await hashPin('1234')
    const b = await hashPin('1234')
    expect(a).not.toBe(b)
    expect(await verifyPin('1234', a)).toBe(true)
    expect(await verifyPin('1234', b)).toBe(true)
  })

  it('rejects a malformed stored value', async () => {
    expect(await verifyPin('1234', 'not-a-valid-hash')).toBe(false)
    expect(await verifyPin('1234', '')).toBe(false)
  })
})
