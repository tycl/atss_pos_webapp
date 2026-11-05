import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setActiveMerchantId } from '../../lib/localSession'
import { pullOrdersForDate } from './pullOrdersForDate'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: fromMock },
}))

const MERCHANT_ID = 'merchant-1'
const OUTLET_ID = 'outlet-1'
const DATE = new Date(2026, 10, 5) // 2026-11-05

const order = {
  id: 'order-1',
  merchant_id: MERCHANT_ID,
  outlet_id: OUTLET_ID,
  status: 'paid',
  created_at: '2026-11-05T10:00:00.000Z',
}
const line = { id: 'line-1', merchant_id: MERCHANT_ID, order_id: 'order-1', item_id: 'item-1' }
const payment = { id: 'payment-1', merchant_id: MERCHANT_ID, order_id: 'order-1', method: 'cash' }

function makeFromMock() {
  return (table: string) => {
    if (table === 'orders') {
      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              lt: async () => ({ data: [order], error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'order_lines') {
      return { select: () => ({ in: async () => ({ data: [line], error: null }) }) }
    }
    if (table === 'payments') {
      return { select: () => ({ in: async () => ({ data: [payment], error: null }) }) }
    }
    throw new Error(`unexpected table in test: ${table}`)
  }
}

beforeEach(async () => {
  await db.merchants.clear()
  await db.orders.clear()
  await db.order_lines.clear()
  await db.payments.clear()
  localStorage.clear()
  fromMock.mockReset()
})

describe('pullOrdersForDate', () => {
  it('pulls orders, order lines, and payments for that local day into Dexie', async () => {
    fromMock.mockImplementation(makeFromMock())

    await pullOrdersForDate(OUTLET_ID, DATE)

    expect(await db.orders.get('order-1')).toEqual(order)
    expect(await db.order_lines.get('line-1')).toEqual(line)
    expect(await db.payments.get('payment-1')).toEqual(payment)
  })

  it('does nothing when there are no orders for that day', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({ gte: () => ({ lt: async () => ({ data: [], error: null }) }) }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    await pullOrdersForDate(OUTLET_ID, DATE)

    expect(await db.orders.count()).toBe(0)
  })

  it('skips the pull entirely for a Basic-plan merchant', async () => {
    await db.merchants.put({ id: MERCHANT_ID, plan: 'basic' } as never)
    setActiveMerchantId(MERCHANT_ID)
    fromMock.mockImplementation(() => {
      throw new Error('should not call Supabase for a Basic-plan merchant')
    })

    await pullOrdersForDate(OUTLET_ID, DATE)

    expect(await db.orders.count()).toBe(0)
  })

  it('propagates a Supabase read error', async () => {
    const readError = new Error('network error')
    fromMock.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({ gte: () => ({ lt: async () => ({ data: null, error: readError }) }) }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    })

    await expect(pullOrdersForDate(OUTLET_ID, DATE)).rejects.toBe(readError)
  })
})
