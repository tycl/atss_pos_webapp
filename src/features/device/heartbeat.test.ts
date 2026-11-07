import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { getDeviceIdForOutlet, setDeviceIdForOutlet } from '../../lib/localSession'
import type { Device } from '../../lib/types'
import { startDeviceHeartbeat } from './heartbeat'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

const DEVICE: Device = {
  id: 'device-1',
  merchant_id: 'merchant-1',
  outlet_id: 'outlet-1',
  label: 'Device 1',
  receipt_prefix: 'D1',
  active: true,
}

// Real, very short interval — avoids fake timers, which don't play well
// with this app's real (fake-indexeddb-backed) Dexie calls.
const TEST_INTERVAL_MS = 10
// For tests that must observe exactly one beat: an interval long enough
// that only the immediate first beat fires within FIRST_BEAT_WAIT_MS.
const LONG_INTERVAL_MS = 1000
// Generous enough for the mocked (no real network) first beat to complete
// even on a slow CI machine, without waiting for a second tick.
const FIRST_BEAT_WAIT_MS = 30

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeFromMock(options: {
  selectResult: { data: unknown; error: unknown }
  onUpdate?: (payload: Record<string, unknown>) => void
}) {
  return (table: string) => {
    if (table !== 'devices') throw new Error(`unexpected table in test: ${table}`)
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => options.selectResult }) }),
      update: (payload: Record<string, unknown>) => {
        options.onUpdate?.(payload)
        return { eq: async () => ({ error: null }) }
      },
    }
  }
}

beforeEach(async () => {
  await db.devices.clear()
  await db.device_bindings.clear()
  localStorage.clear()
  fromMock.mockReset()
})

describe('startDeviceHeartbeat', () => {
  it('writes last_seen_at/session_id/user_agent on the first beat', async () => {
    const updates: Record<string, unknown>[] = []
    fromMock.mockImplementation(
      makeFromMock({ selectResult: { data: null, error: null }, onUpdate: (p) => updates.push(p) }),
    )

    const handle = startDeviceHeartbeat(DEVICE, 'outlet-1', vi.fn(), vi.fn(), LONG_INTERVAL_MS)
    await sleep(FIRST_BEAT_WAIT_MS)
    handle.stop()

    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      session_id: expect.any(String),
      last_seen_at: expect.any(String),
      user_agent: expect.any(String),
    })
  })

  it('ticks again after intervalMs', async () => {
    const updates: Record<string, unknown>[] = []
    fromMock.mockImplementation(
      makeFromMock({ selectResult: { data: null, error: null }, onUpdate: (p) => updates.push(p) }),
    )

    const handle = startDeviceHeartbeat(DEVICE, 'outlet-1', vi.fn(), vi.fn(), TEST_INTERVAL_MS)
    await sleep(TEST_INTERVAL_MS * 3.5)
    handle.stop()

    expect(updates.length).toBeGreaterThanOrEqual(2)
  })

  it('stops ticking once stop() is called', async () => {
    const updates: Record<string, unknown>[] = []
    fromMock.mockImplementation(
      makeFromMock({ selectResult: { data: null, error: null }, onUpdate: (p) => updates.push(p) }),
    )

    const handle = startDeviceHeartbeat(DEVICE, 'outlet-1', vi.fn(), vi.fn(), TEST_INTERVAL_MS)
    await sleep(FIRST_BEAT_WAIT_MS)
    handle.stop()
    const countAfterStop = updates.length

    await sleep(TEST_INTERVAL_MS * 3)

    expect(updates.length).toBe(countAfterStop)
  })

  it('reports a collision when another session heartbeated recently', async () => {
    fromMock.mockImplementation(
      makeFromMock({
        selectResult: {
          data: {
            session_id: 'other-session',
            last_seen_at: new Date().toISOString(),
            force_reclaim_requested_at: null,
          },
          error: null,
        },
      }),
    )
    const onCollision = vi.fn()

    const handle = startDeviceHeartbeat(DEVICE, 'outlet-1', onCollision, vi.fn(), TEST_INTERVAL_MS)
    await sleep(FIRST_BEAT_WAIT_MS)
    handle.stop()

    expect(onCollision).toHaveBeenCalledWith(true)
  })

  it('does not report a collision for a stale other session', async () => {
    fromMock.mockImplementation(
      makeFromMock({
        selectResult: {
          data: {
            session_id: 'other-session',
            last_seen_at: new Date(Date.now() - 10 * 60_000).toISOString(),
            force_reclaim_requested_at: null,
          },
          error: null,
        },
      }),
    )
    const onCollision = vi.fn()

    const handle = startDeviceHeartbeat(DEVICE, 'outlet-1', onCollision, vi.fn(), TEST_INTERVAL_MS)
    await sleep(FIRST_BEAT_WAIT_MS)
    handle.stop()

    expect(onCollision).toHaveBeenCalledWith(false)
  })

  it('does not report a collision when the found session_id is its own', async () => {
    let writtenSessionId: string | undefined
    fromMock.mockImplementation((table: string) => {
      if (table !== 'devices') throw new Error(`unexpected table in test: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: writtenSessionId
                ? {
                    session_id: writtenSessionId,
                    last_seen_at: new Date().toISOString(),
                    force_reclaim_requested_at: null,
                  }
                : null,
              error: null,
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          writtenSessionId = payload.session_id as string
          return { eq: async () => ({ error: null }) }
        },
      }
    })
    const onCollision = vi.fn()

    const handle = startDeviceHeartbeat(DEVICE, 'outlet-1', onCollision, vi.fn(), TEST_INTERVAL_MS)
    await sleep(TEST_INTERVAL_MS * 2.5)
    handle.stop()

    expect(onCollision).toHaveBeenCalledWith(false)
  })

  it('reacts to a force-reclaim by invalidating the local binding and calling onForceReclaimed', async () => {
    await db.devices.add(DEVICE)
    setDeviceIdForOutlet('outlet-1', DEVICE.id)
    await db.device_bindings.put({ outlet_id: 'outlet-1', device_id: DEVICE.id })

    let clearedFlag = false
    fromMock.mockImplementation(
      makeFromMock({
        selectResult: {
          data: {
            session_id: null,
            last_seen_at: null,
            force_reclaim_requested_at: new Date().toISOString(),
          },
          error: null,
        },
        onUpdate: (payload) => {
          if (payload.force_reclaim_requested_at === null) clearedFlag = true
        },
      }),
    )
    const onForceReclaimed = vi.fn()

    const handle = startDeviceHeartbeat(
      DEVICE,
      'outlet-1',
      vi.fn(),
      onForceReclaimed,
      LONG_INTERVAL_MS,
    )
    await sleep(FIRST_BEAT_WAIT_MS)
    handle.stop()

    expect(onForceReclaimed).toHaveBeenCalledTimes(1)
    expect(clearedFlag).toBe(true)
    expect(getDeviceIdForOutlet('outlet-1')).toBeNull()
    expect(await db.device_bindings.get('outlet-1')).toBeUndefined()
  })

  it('does not throw when a beat fails, and logs it instead', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fromMock.mockImplementation(() => {
      throw new Error('network down')
    })

    const handle = startDeviceHeartbeat(DEVICE, 'outlet-1', vi.fn(), vi.fn(), LONG_INTERVAL_MS)
    await sleep(FIRST_BEAT_WAIT_MS)
    handle.stop()

    expect(consoleErrorSpy).toHaveBeenCalledWith('device heartbeat: beat failed', expect.any(Error))

    consoleErrorSpy.mockRestore()
  })
})
