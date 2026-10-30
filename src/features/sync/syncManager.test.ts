import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getPendingCountMock, drainOnceMock, onQueueChangedMock } = vi.hoisted(() => ({
  getPendingCountMock: vi.fn(),
  drainOnceMock: vi.fn(),
  onQueueChangedMock: vi.fn(() => () => {}),
}))

vi.mock('./queue', () => ({
  getPendingCount: getPendingCountMock,
  drainOnce: drainOnceMock,
  onQueueChanged: onQueueChangedMock,
}))

import { startSyncManager } from './syncManager'

beforeEach(() => {
  vi.useFakeTimers()
  getPendingCountMock.mockReset()
  drainOnceMock.mockReset()
  onQueueChangedMock.mockClear()
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startSyncManager', () => {
  it('keeps retrying after an unexpected error instead of dying silently', async () => {
    getPendingCountMock.mockRejectedValueOnce(new Error('Dexie unavailable'))
    getPendingCountMock.mockResolvedValue(0)

    const manager = startSyncManager()

    // The first (failing) attempt runs on mount.
    await vi.waitFor(() => expect(getPendingCountMock).toHaveBeenCalledTimes(1))

    // It must still schedule a retry — advancing well past any backoff delay.
    await vi.advanceTimersByTimeAsync(10_000)
    await vi.waitFor(() => expect(getPendingCountMock).toHaveBeenCalledTimes(2))

    manager.stop()
  })

  it('does nothing when the queue is empty and the browser is online', async () => {
    getPendingCountMock.mockResolvedValue(0)

    const manager = startSyncManager()
    await vi.waitFor(() => expect(getPendingCountMock).toHaveBeenCalledTimes(1))

    expect(drainOnceMock).not.toHaveBeenCalled()
    manager.stop()
  })
})
