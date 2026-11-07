import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './persistentStorage'

const originalStorage = navigator.storage

afterEach(() => {
  Object.defineProperty(navigator, 'storage', { value: originalStorage, configurable: true })
  vi.restoreAllMocks()
})

describe('requestPersistentStorage', () => {
  it('returns true when the browser grants persistence', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { persist: vi.fn().mockResolvedValue(true) },
      configurable: true,
    })

    expect(await requestPersistentStorage()).toBe(true)
  })

  it('returns false and warns when the browser declines', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    Object.defineProperty(navigator, 'storage', {
      value: { persist: vi.fn().mockResolvedValue(false) },
      configurable: true,
    })

    expect(await requestPersistentStorage()).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('returns false without throwing when the request rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    Object.defineProperty(navigator, 'storage', {
      value: { persist: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })

    expect(await requestPersistentStorage()).toBe(false)
  })

  it('returns false when the API is unsupported', async () => {
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true })

    expect(await requestPersistentStorage()).toBe(false)
  })
})
