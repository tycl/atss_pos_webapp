import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { drainOnce, enqueue, getPendingCount, pushOne } from './queue'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

/** A fake postgrest-js query builder: `.eq()` chains, and the object itself is awaitable. */
function makeDeleteBuilder(result: { error: unknown }) {
  const builder = {
    eq: vi.fn(() => builder),
    then: (resolve: (value: { error: unknown }) => void) => resolve(result),
  }
  return builder
}

beforeEach(async () => {
  fromMock.mockReset()
  await db.sync_queue.clear()
})

describe('enqueue / getPendingCount', () => {
  it('adds an item to the queue', async () => {
    expect(await getPendingCount()).toBe(0)
    await enqueue('staff', 'upsert', { id: 's1' })
    expect(await getPendingCount()).toBe(1)
  })
})

describe('pushOne', () => {
  it('upserts the payload for an upsert op', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({ upsert })

    await pushOne({
      id: 'q1',
      table: 'staff',
      op: 'upsert',
      payload: { id: 's1', name: 'Alice' },
      created_at: new Date().toISOString(),
      seq: 1,
      attempts: 0,
      last_error: null,
    })

    expect(fromMock).toHaveBeenCalledWith('staff')
    expect(upsert).toHaveBeenCalledWith({ id: 's1', name: 'Alice' })
  })

  it('throws when Supabase returns an error', async () => {
    fromMock.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: new Error('boom') }) })

    await expect(
      pushOne({
        id: 'q1',
        table: 'staff',
        op: 'upsert',
        payload: { id: 's1' },
        created_at: new Date().toISOString(),
        seq: 1,
        attempts: 0,
        last_error: null,
      }),
    ).rejects.toThrow('boom')
  })

  it('filters by every payload column for a delete op', async () => {
    const builder = makeDeleteBuilder({ error: null })
    fromMock.mockReturnValue({ delete: () => builder })

    await pushOne({
      id: 'q1',
      table: 'settings',
      op: 'delete',
      payload: { outlet_id: 'o1' },
      created_at: new Date().toISOString(),
      seq: 1,
      attempts: 0,
      last_error: null,
    })

    expect(builder.eq).toHaveBeenCalledWith('outlet_id', 'o1')
  })
})

describe('drainOnce', () => {
  it('removes every item on success, oldest first', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({ upsert })

    await enqueue('staff', 'upsert', { id: 's1' })
    await enqueue('staff', 'upsert', { id: 's2' })

    const result = await drainOnce()

    expect(result).toEqual({ pushed: 2, remaining: 0 })
    expect(upsert).toHaveBeenNthCalledWith(1, { id: 's1' })
    expect(upsert).toHaveBeenNthCalledWith(2, { id: 's2' })
  })

  it('stops at the first failure and records the error, leaving it queued', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: new Error('offline') })
    fromMock.mockReturnValue({ upsert })

    await enqueue('staff', 'upsert', { id: 's1' })
    await enqueue('staff', 'upsert', { id: 's2' })

    const result = await drainOnce()

    expect(result).toEqual({ pushed: 0, remaining: 2 })
    expect(upsert).toHaveBeenCalledTimes(1)

    const remaining = await db.sync_queue.orderBy('seq').toArray()
    expect(remaining[0].attempts).toBe(1)
    expect(remaining[0].last_error).toBe('offline')
    expect(remaining[1].attempts).toBe(0)
  })

  it('does not throw if recording the failure itself fails (e.g. a broken IndexedDB connection)', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: new Error('offline') })
    fromMock.mockReturnValue({ upsert })

    await enqueue('staff', 'upsert', { id: 's1' })

    const updateSpy = vi
      .spyOn(db.sync_queue, 'update')
      .mockRejectedValueOnce(new Error('idb connection is closing'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await drainOnce()

    expect(result).toEqual({ pushed: 0, remaining: 1 })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'sync queue: could not record a failed push',
      expect.objectContaining({ itemId: expect.any(String) }),
    )

    updateSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('does nothing when the queue is empty', async () => {
    const result = await drainOnce()
    expect(result).toEqual({ pushed: 0, remaining: 0 })
  })

  it('pushes each item only once when called concurrently (e.g. StrictMode double-invoke)', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({ upsert })

    await enqueue('staff', 'upsert', { id: 's1' })
    await enqueue('staff', 'upsert', { id: 's2' })

    const [first, second] = await Promise.all([drainOnce(), drainOnce()])

    expect(upsert).toHaveBeenCalledTimes(2)
    expect(first).toEqual(second)
    expect(first).toEqual({ pushed: 2, remaining: 0 })
  })
})
