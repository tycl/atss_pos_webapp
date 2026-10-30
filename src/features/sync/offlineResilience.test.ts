import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CartLine } from '../../lib/cart'
import { db } from '../../lib/db'
import type { Settings } from '../../lib/types'
import { placeOrder } from '../ordering/orderApi'
import { drainOnce, getPendingCount } from './queue'

// CLAUDE.md Phase 5: "Full offline test: create 50 orders offline,
// reconnect, verify sync." Driven through the real `placeOrder` (not the
// queue directly) so this exercises the same code path the POS screen uses:
// Dexie write -> enqueue -> (later) drain.

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

const MERCHANT_ID = 'merchant-1'
const OUTLET_ID = 'outlet-1'
const DEVICE_ID = 'device-1'
const STAFF_ID = 'staff-1'

const settings: Settings = {
  outlet_id: OUTLET_ID,
  merchant_id: MERCHANT_ID,
  sst_enabled: false,
  sst_rate_bp: 0,
  service_charge_enabled: false,
  service_charge_rate_bp: 0,
  cash_rounding_enabled: false,
  duitnow_qr_url: null,
  print_bridge_url: null,
}

function cartLine(i: number): CartLine {
  return {
    lineId: crypto.randomUUID(),
    itemId: 'item-1',
    name: 'Teh Ais',
    unitPriceSen: 250,
    qty: (i % 3) + 1,
    modifiers: [],
    note: i % 5 === 0 ? 'less ice' : null,
  }
}

async function placeOneOrder(i: number) {
  return placeOrder({
    merchantId: MERCHANT_ID,
    outletId: OUTLET_ID,
    deviceId: DEVICE_ID,
    devicePrefix: 'D1',
    staffId: STAFF_ID,
    type: 'takeaway',
    tableId: null,
    lines: [cartLine(i)],
    settings,
  })
}

beforeEach(async () => {
  await db.orders.clear()
  await db.order_lines.clear()
  await db.sync_queue.clear()
  fromMock.mockReset()
})

describe('offline resilience: 50 orders offline, then reconnect', () => {
  it('persists all 50 orders locally while every network call fails', async () => {
    fromMock.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: new Error('offline') }) })

    const placed = []
    for (let i = 0; i < 50; i++) {
      placed.push(await placeOneOrder(i))
    }

    // Nothing was lost, nothing was skipped, waiting for a network that isn't there.
    const storedOrders = await db.orders.toArray()
    expect(storedOrders).toHaveLength(50)
    const storedLines = await db.order_lines.toArray()
    expect(storedLines).toHaveLength(50)

    // Order numbers are unique and sequential — generateOrderNo works correctly under a loop.
    const orderNos = storedOrders.map((o) => o.order_no).sort()
    const expectedNos = Array.from(
      { length: 50 },
      (_, i) => `D1-${storedOrders[0].order_no.split('-')[1]}-${i + 1}`,
    ).sort()
    expect(orderNos).toEqual(expectedNos)

    // Every order + its line is queued: 50 orders + 50 lines = 100 pending pushes.
    expect(await getPendingCount()).toBe(100)

    // "Reconnect": the network works now.
    const upsert = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({ upsert })

    const result = await drainOnce()

    expect(result.pushed).toBe(100)
    expect(result.remaining).toBe(0)
    expect(await getPendingCount()).toBe(0)
    expect(upsert).toHaveBeenCalledTimes(100)

    // Every pushed payload is one of our 100 real rows — nothing duplicated, nothing invented.
    const pushedIds = upsert.mock.calls.map((call) => (call[0] as { id: string }).id)
    expect(new Set(pushedIds).size).toBe(100)
    const localIds = new Set([...storedOrders.map((o) => o.id), ...storedLines.map((l) => l.id)])
    for (const id of pushedIds) expect(localIds.has(id)).toBe(true)

    // Spot-check one order's actual pushed content, not just that *something* was pushed.
    const pushedOrderPayload = upsert.mock.calls
      .map((call) => call[0] as { id: string; order_no?: string })
      .find((payload) => payload.id === placed[25].id)
    expect(pushedOrderPayload?.order_no).toBe(placed[25].order_no)
  })

  it('recovers from a flaky reconnect without losing or duplicating items', async () => {
    fromMock.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: new Error('offline') }) })
    for (let i = 0; i < 10; i++) await placeOneOrder(i)
    expect(await getPendingCount()).toBe(20) // 10 orders + 10 lines

    // Reconnect, but the very first push attempt is still flaky and fails once more.
    let callCount = 0
    const upsert = vi.fn().mockImplementation(async () => {
      callCount++
      return callCount === 1 ? { error: new Error('still flaky') } : { error: null }
    })
    fromMock.mockReturnValue({ upsert })

    const firstAttempt = await drainOnce()
    expect(firstAttempt.pushed).toBe(0)
    expect(firstAttempt.remaining).toBe(20)

    const secondAttempt = await drainOnce()
    expect(secondAttempt.pushed).toBe(20)
    expect(secondAttempt.remaining).toBe(0)
    // The failed-then-retried item is attempted twice (expected — that's the
    // retry working), but every item is *successfully* pushed exactly once:
    // 1 failed attempt + 20 successful ones = 21 calls total for 20 items.
    expect(upsert).toHaveBeenCalledTimes(21)
  })

  it('does not block ordering while offline — orders stay usable regardless of sync state', async () => {
    fromMock.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: new Error('offline') }) })

    const order = await placeOneOrder(0)

    // The order is immediately readable, with correct totals, even though it
    // hasn't synced — this is the entire point of local-first.
    const stored = await db.orders.get(order.id)
    expect(stored?.status).toBe('open')
    expect(stored?.total_sen).toBe(order.total_sen)
  })
})
