import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearActiveMerchant,
  clearDeviceIdForOutlet,
  getActiveDeviceId,
  getActiveMerchantId,
  getActiveOutletId,
  getDeviceIdForOutlet,
  setActiveDeviceId,
  setActiveMerchantId,
  setActiveOutletId,
  setDeviceIdForOutlet,
} from './localSession'

beforeEach(() => {
  localStorage.clear()
})

describe('localSession', () => {
  it('returns null when nothing has been set', () => {
    expect(getActiveMerchantId()).toBeNull()
    expect(getActiveOutletId()).toBeNull()
    expect(getActiveDeviceId()).toBeNull()
  })

  it('stores and retrieves the active merchant, outlet, and device', () => {
    setActiveMerchantId('merchant-1')
    setActiveOutletId('outlet-1')
    setActiveDeviceId('device-1')
    expect(getActiveMerchantId()).toBe('merchant-1')
    expect(getActiveOutletId()).toBe('outlet-1')
    expect(getActiveDeviceId()).toBe('device-1')
  })

  it('clears all three values', () => {
    setActiveMerchantId('merchant-1')
    setActiveOutletId('outlet-1')
    setActiveDeviceId('device-1')
    clearActiveMerchant()
    expect(getActiveMerchantId()).toBeNull()
    expect(getActiveOutletId()).toBeNull()
    expect(getActiveDeviceId()).toBeNull()
  })

  it("clears the current outlet's per-outlet device binding too", () => {
    setActiveOutletId('outlet-1')
    setDeviceIdForOutlet('outlet-1', 'device-1')
    clearActiveMerchant()
    expect(getDeviceIdForOutlet('outlet-1')).toBeNull()
  })

  it("does not touch a different outlet's per-outlet device binding", () => {
    setActiveOutletId('outlet-1')
    setDeviceIdForOutlet('outlet-1', 'device-1')
    setDeviceIdForOutlet('outlet-2', 'device-2')
    clearActiveMerchant()
    expect(getDeviceIdForOutlet('outlet-2')).toBe('device-2')
  })
})

describe('per-outlet device binding', () => {
  it('returns null when nothing has been set for that outlet', () => {
    expect(getDeviceIdForOutlet('outlet-1')).toBeNull()
  })

  it('stores and retrieves a device id per outlet, independently of other outlets', () => {
    setDeviceIdForOutlet('outlet-1', 'device-1')
    setDeviceIdForOutlet('outlet-2', 'device-2')
    expect(getDeviceIdForOutlet('outlet-1')).toBe('device-1')
    expect(getDeviceIdForOutlet('outlet-2')).toBe('device-2')
  })

  it("clears only the given outlet's device id", () => {
    setDeviceIdForOutlet('outlet-1', 'device-1')
    setDeviceIdForOutlet('outlet-2', 'device-2')
    clearDeviceIdForOutlet('outlet-1')
    expect(getDeviceIdForOutlet('outlet-1')).toBeNull()
    expect(getDeviceIdForOutlet('outlet-2')).toBe('device-2')
  })
})
