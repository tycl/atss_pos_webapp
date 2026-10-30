import { describe, expect, it } from 'vitest'
import { db } from './db'

describe('AtssPosDB schema', () => {
  it('defines a table for every entity in the schema', () => {
    const tableNames = db.tables.map((t) => t.name).sort()
    expect(tableNames).toEqual(
      [
        'audit_log',
        'categories',
        'devices',
        'dine_tables',
        'item_modifier_groups',
        'items',
        'merchants',
        'modifier_groups',
        'modifiers',
        'orders',
        'order_lines',
        'outlets',
        'payments',
        'settings',
        'shifts',
        'staff',
        'sync_queue',
      ].sort(),
    )
  })

  it('exposes db.tables as the Dexie built-in (not shadowed by a store named "tables")', () => {
    expect(Array.isArray(db.tables)).toBe(true)
  })
})
