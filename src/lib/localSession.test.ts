import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearActiveMerchant,
  getActiveDeviceId,
  getActiveMerchantId,
  getActiveOutletId,
  setActiveDeviceId,
  setActiveMerchantId,
  setActiveOutletId,
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
})
