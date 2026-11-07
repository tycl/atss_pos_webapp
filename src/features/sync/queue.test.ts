import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { clearActiveMerchant, setActiveMerchantId } from '../../lib/localSession'
import type { Merchant } from '../../lib/types'
import {
  drainOnce,
  enqueue,
  getPendingCount,
  isSyncDisabledForActiveMerchant,
  onQueueChanged,
  pushOne,
} from './queue'

function makeMerchant(overrides: Partial<Merchant>): Merchant {
  return {
    id: 'merchant-1',
    name: 'Test Shop',
    ssm_no: null,
    sst_no: null,
    address: null,
    phone: null,
    logo_url: null,
    plan: 'standard',
    status: 'active',
    subscription_started_at: null,
    subscription_expires_at: null,
    ...overrides,
  }
}

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
  await db.merchants.clear()
  await db.devices.clear()
  clearActiveMerchant()
})

describe('enqueue / getPendingCount', () => {
  it('adds an item to the queue', async () => {
    expect(await getPendingCount()).toBe(0)
    await enqueue('staff', 'upsert', { id: 's1' })
    expect(await getPendingCount()).toBe(1)
  })
})

describe('isSyncDisabledForActiveMerchant / enqueue plan gating', () => {
  it('is not disabled when no merchant is active yet (e.g. mid-onboarding)', async () => {
    expect(await isSyncDisabledForActiveMerchant()).toBe(false)
  })

  it('is not disabled for a standard-plan merchant', async () => {
    await db.merchants.put(makeMerchant({ plan: 'standard' }))
    setActiveMerchantId('merchant-1')

    expect(await isSyncDisabledForActiveMerchant()).toBe(false)
    await enqueue('staff', 'upsert', { id: 's1' })
    expect(await getPendingCount()).toBe(1)
  })

  it('is disabled for a basic-plan merchant, and enqueue becomes a no-op', async () => {
    await db.merchants.put(makeMerchant({ plan: 'basic' }))
    setActiveMerchantId('merchant-1')

    expect(await isSyncDisabledForActiveMerchant()).toBe(true)

    const listener = vi.fn()
    const unsubscribe = onQueueChanged(listener)
    await enqueue('staff', 'upsert', { id: 's1' })
    unsubscribe()

    expect(await getPendingCount()).toBe(0)
    expect(listener).not.toHaveBeenCalled()
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

  it('a transient failure (e.g. offline) stops the batch at the first attempt, leaving it queued', async () => {
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
    expect(remaining[0].last_error_type).toBe('transient')
    expect(remaining[1].attempts).toBe(0)
  })

  it('a permanent error (e.g. a foreign key violation) does not block the rest of the batch, even on the first attempt', async () => {
    const upsert = vi.fn((payload: { id: string }) =>
      payload.id === 'orphaned'
        ? Promise.resolve({
            error: {
              code: '23503',
              message: 'insert or update on table "staff" violates foreign key constraint',
            },
          })
        : Promise.resolve({ error: null }),
    )
    fromMock.mockReturnValue({ upsert })

    await enqueue('staff', 'upsert', { id: 'orphaned' })
    await enqueue('staff', 'upsert', { id: 'healthy' })

    const result = await drainOnce()

    expect(result).toEqual({ pushed: 1, remaining: 1 })
    expect(upsert).toHaveBeenCalledWith({ id: 'healthy' })

    const [stuck] = await db.sync_queue.orderBy('seq').toArray()
    expect(stuck.attempts).toBe(1)
    expect(stuck.last_error_type).toBe('permanent')
    expect(stuck.last_error_code).toBe('23503')
  })

  it('auto-recovers a devices receipt-prefix conflict (23505) without blocking an unrelated item, or counting as a failed attempt', async () => {
    let devicesUpsertCalls = 0
    const devicesUpsert = vi.fn(() => {
      devicesUpsertCalls++
      if (devicesUpsertCalls === 1) {
        return Promise.resolve({
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        })
      }
      return Promise.resolve({ error: null })
    })
    const staffUpsert = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'devices') {
        return {
          upsert: devicesUpsert,
          select: () => ({
            eq: async () => ({ data: [{ receipt_prefix: 'D1' }], error: null }),
          }),
        }
      }
      if (table === 'staff') return { upsert: staffUpsert }
      throw new Error(`unexpected table in test: ${table}`)
    })

    await db.devices.add({
      id: 'device-1',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      label: 'Device 1',
      receipt_prefix: 'D1',
      active: true,
    })
    await enqueue('devices', 'upsert', {
      id: 'device-1',
      merchant_id: 'merchant-1',
      outlet_id: 'outlet-1',
      label: 'Device 1',
      receipt_prefix: 'D1',
      active: true,
    })
    await enqueue('staff', 'upsert', { id: 's1' })

    const firstResult = await drainOnce()

    expect(firstResult).toEqual({ pushed: 1, remaining: 1 })
    expect(staffUpsert).toHaveBeenCalledWith({ id: 's1' })

    const [deviceItem] = await db.sync_queue.toArray()
    expect(deviceItem.attempts).toBe(0)
    expect(deviceItem.payload.receipt_prefix).toBe('D2')
    expect(await db.devices.get('device-1')).toMatchObject({ receipt_prefix: 'D2' })

    const secondResult = await drainOnce()

    expect(secondResult).toEqual({ pushed: 1, remaining: 0 })
    expect(devicesUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ receipt_prefix: 'D2' }),
    )
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

  it('records the actual message from a non-Error (PostgREST-style) rejection instead of "[object Object]"', async () => {
    const upsert = vi
      .fn()
      .mockResolvedValue({ error: { message: 'new row violates row-level security policy' } })
    fromMock.mockReturnValue({ upsert })

    await enqueue('staff', 'upsert', { id: 's1' })
    await drainOnce()

    const [item] = await db.sync_queue.orderBy('seq').toArray()
    expect(item.last_error).toBe('new row violates row-level security policy')
  })

  it('skips an item that has already failed many times, instead of blocking everything behind it', async () => {
    const upsert = vi.fn((payload: { id: string }) =>
      payload.id === 'stuck'
        ? Promise.resolve({ error: new Error('still broken') })
        : Promise.resolve({ error: null }),
    )
    fromMock.mockReturnValue({ upsert })

    // Already failed four times (e.g. it was queued under a session that no
    // longer has access to this data) — one more failure reaches the limit.
    await db.sync_queue.add({
      id: 'stuck-queue-item',
      table: 'staff',
      op: 'upsert',
      payload: { id: 'stuck' },
      created_at: new Date().toISOString(),
      seq: 1,
      attempts: 4,
      last_error: 'still broken',
    })
    await enqueue('staff', 'upsert', { id: 'fresh' })

    const result = await drainOnce()

    expect(result).toEqual({ pushed: 1, remaining: 1 })
    expect(upsert).toHaveBeenCalledWith({ id: 'fresh' })

    const stuckItem = await db.sync_queue.get('stuck-queue-item')
    expect(stuckItem?.attempts).toBe(5)
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
