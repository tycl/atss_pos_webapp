import { db } from '../../lib/db'
import type { Table } from '../../lib/types'
import { enqueue } from '../sync/queue'

// Dine-in tables for an outlet. Stored locally as `dine_tables` (see
// lib/db.ts for why), synced to Supabase's `tables`.

export async function listTables(outletId: string): Promise<Table[]> {
  return db.dine_tables.where({ outlet_id: outletId }).sortBy('sort_order')
}

export async function createTable(input: {
  merchantId: string
  outletId: string
  name: string
  sortOrder: number
}): Promise<Table> {
  const table: Table = {
    id: crypto.randomUUID(),
    merchant_id: input.merchantId,
    outlet_id: input.outletId,
    name: input.name,
    sort_order: input.sortOrder,
  }
  await db.dine_tables.put(table)
  await enqueue('tables', 'upsert', { ...table })
  return table
}

export async function updateTable(
  id: string,
  changes: Partial<Pick<Table, 'name' | 'sort_order'>>,
): Promise<Table> {
  await db.dine_tables.update(id, changes)
  const updated = await db.dine_tables.get(id)
  if (!updated) throw new Error(`Table not found after update: ${id}`)
  await enqueue('tables', 'upsert', { ...updated })
  return updated
}

export async function deleteTable(id: string): Promise<void> {
  await db.dine_tables.delete(id)
  await enqueue('tables', 'delete', { id })
}
