import Dexie, { type EntityTable, type Table as DexieTable } from 'dexie'
import type {
  AuditLog,
  Category,
  Device,
  Item,
  ItemModifierGroup,
  Merchant,
  Modifier,
  ModifierGroup,
  Order,
  OrderLine,
  Outlet,
  Payment,
  Settings,
  Shift,
  Staff,
  SyncQueueItem,
  Table,
} from './types'

// Local-first storage: every write lands here first, then a sync queue pushes
// it to Supabase when online (CLAUDE.md section 8). Shapes mirror section 6
// exactly so the same types describe both stores.
export class AtssPosDB extends Dexie {
  merchants!: EntityTable<Merchant, 'id'>
  outlets!: EntityTable<Outlet, 'id'>
  devices!: EntityTable<Device, 'id'>
  staff!: EntityTable<Staff, 'id'>
  settings!: EntityTable<Settings, 'outlet_id'>
  categories!: EntityTable<Category, 'id'>
  items!: EntityTable<Item, 'id'>
  modifier_groups!: EntityTable<ModifierGroup, 'id'>
  modifiers!: EntityTable<Modifier, 'id'>
  // Pure join table with a compound primary key — no single-column key to type as EntityTable.
  item_modifier_groups!: DexieTable<ItemModifierGroup, [string, string]>
  // Named `dine_tables` locally (not `tables`) because Dexie reserves `db.tables`
  // as the built-in getter for "all tables in this database" — a store named
  // `tables` would silently shadow it. The cloud/Postgres table stays `tables`.
  dine_tables!: EntityTable<Table, 'id'>
  orders!: EntityTable<Order, 'id'>
  order_lines!: EntityTable<OrderLine, 'id'>
  payments!: EntityTable<Payment, 'id'>
  shifts!: EntityTable<Shift, 'id'>
  audit_log!: EntityTable<AuditLog, 'id'>
  sync_queue!: EntityTable<SyncQueueItem, 'id'>

  constructor() {
    super('atss-pos')
    this.version(1).stores({
      merchants: 'id',
      outlets: 'id, merchant_id',
      devices: 'id, merchant_id, outlet_id',
      staff: 'id, merchant_id',
      settings: 'outlet_id, merchant_id',
      categories: 'id, merchant_id, sort_order',
      items: 'id, merchant_id, category_id, sort_order',
      modifier_groups: 'id, merchant_id',
      modifiers: 'id, merchant_id, group_id',
      item_modifier_groups: '[item_id+group_id], merchant_id, item_id, group_id',
      dine_tables: 'id, merchant_id, outlet_id, sort_order',
      orders: 'id, merchant_id, outlet_id, device_id, status, created_at, [outlet_id+status]',
      order_lines: 'id, merchant_id, order_id, item_id',
      payments: 'id, merchant_id, order_id',
      shifts: 'id, merchant_id, outlet_id, device_id, opened_at',
      audit_log: 'id, merchant_id, created_at',
      sync_queue: 'id, seq',
    })
  }
}

export const db = new AtssPosDB()
