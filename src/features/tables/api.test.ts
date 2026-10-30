import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createTable, deleteTable, listTables, updateTable } from './api'

const MERCHANT_A = 'merchant-a'
const OUTLET_A = 'outlet-a'
const OUTLET_B = 'outlet-b'

beforeEach(async () => {
  await db.dine_tables.clear()
  await db.sync_queue.clear()
})

describe('tables', () => {
  it('creates a table, writes it to Dexie, and queues it for sync', async () => {
    const table = await createTable({
      merchantId: MERCHANT_A,
      outletId: OUTLET_A,
      name: 'Table 1',
      sortOrder: 0,
    })

    expect(await db.dine_tables.get(table.id)).toEqual(table)
    const queued = await db.sync_queue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ table: 'tables', op: 'upsert', payload: table })
  })

  it('lists only the given outlet’s tables, sorted by sort_order', async () => {
    await createTable({ merchantId: MERCHANT_A, outletId: OUTLET_A, name: 'Second', sortOrder: 1 })
    await createTable({ merchantId: MERCHANT_A, outletId: OUTLET_A, name: 'First', sortOrder: 0 })
    await createTable({
      merchantId: MERCHANT_A,
      outletId: OUTLET_B,
      name: 'Other outlet',
      sortOrder: 0,
    })

    const result = await listTables(OUTLET_A)
    expect(result.map((t) => t.name)).toEqual(['First', 'Second'])
  })

  it('updates and deletes a table', async () => {
    const table = await createTable({
      merchantId: MERCHANT_A,
      outletId: OUTLET_A,
      name: 'Table 1',
      sortOrder: 0,
    })

    const renamed = await updateTable(table.id, { name: 'T1' })
    expect(renamed.name).toBe('T1')

    await deleteTable(table.id)
    expect(await db.dine_tables.get(table.id)).toBeUndefined()
  })
})
