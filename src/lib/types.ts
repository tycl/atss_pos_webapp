// Shared entity types for the Dexie (local) and Supabase (cloud) schemas.
// Both stores use the same shapes — see CLAUDE.md section 6.

export type UUID = string
export type ISODateTime = string

export type StaffRole = 'owner' | 'manager' | 'cashier'
export type OrderType = 'dine_in' | 'takeaway'
export type OrderStatus = 'open' | 'paid' | 'void'
export type OrderLineStatus = 'active' | 'void'
export type PaymentMethod = 'cash' | 'duitnow_qr'
// Not specified in CLAUDE.md yet — kept as free-form strings until the
// subscription plan/status values are decided.
export type MerchantPlan = string
export type MerchantStatus = string

export interface Merchant {
  id: UUID
  name: string
  ssm_no: string | null
  sst_no: string | null
  address: string | null
  phone: string | null
  logo_url: string | null
  plan: MerchantPlan
  status: MerchantStatus
}

export interface Outlet {
  id: UUID
  merchant_id: UUID
  name: string
  address: string | null
  receipt_footer: string | null
}

export interface Device {
  id: UUID
  merchant_id: UUID
  outlet_id: UUID
  label: string
  receipt_prefix: string
}

export interface Staff {
  id: UUID
  merchant_id: UUID
  name: string
  role: StaffRole
  pin_hash: string
  active: boolean
}

export interface Settings {
  outlet_id: UUID
  merchant_id: UUID
  sst_enabled: boolean
  sst_rate_bp: number
  service_charge_enabled: boolean
  service_charge_rate_bp: number
  cash_rounding_enabled: boolean
  // Not in CLAUDE.md section 6's schema listing — added for section 9's
  // "show the merchant's own DuitNow QR image on screen". A URL rather than
  // an upload flow since no file storage is set up yet.
  duitnow_qr_url: string | null
  // Not in section 6 either — where this device finds its local print-bridge
  // agent (section 2's "local print-bridge agent ... over LAN HTTP").
  // Defaults to http://localhost:7777 (the common case: agent and browser
  // on the same counter PC) but is overridable per outlet.
  print_bridge_url: string | null
}

export interface Category {
  id: UUID
  merchant_id: UUID
  name: string
  sort_order: number
}

export interface Item {
  id: UUID
  merchant_id: UUID
  category_id: UUID
  name: string
  price_sen: number
  active: boolean
  sort_order: number
}

export interface ModifierGroup {
  id: UUID
  merchant_id: UUID
  name: string
  required: boolean
  max_select: number
}

export interface Modifier {
  id: UUID
  merchant_id: UUID
  group_id: UUID
  name: string
  price_sen: number
}

export interface ItemModifierGroup {
  merchant_id: UUID
  item_id: UUID
  group_id: UUID
}

export interface Table {
  id: UUID
  merchant_id: UUID
  outlet_id: UUID
  name: string
  sort_order: number
}

export interface Order {
  id: UUID
  merchant_id: UUID
  outlet_id: UUID
  device_id: UUID
  order_no: string
  type: OrderType
  table_id: UUID | null
  status: OrderStatus
  subtotal_sen: number
  discount_sen: number
  discount_reason: string | null
  service_charge_sen: number
  sst_sen: number
  rounding_sen: number
  total_sen: number
  created_by: UUID
  created_at: ISODateTime
  paid_at: ISODateTime | null
  synced_at: ISODateTime | null
}

export interface ModifierSnapshot {
  modifier_id: UUID
  name: string
  price_sen: number
}

export interface OrderLine {
  id: UUID
  merchant_id: UUID
  order_id: UUID
  item_id: UUID
  name_snapshot: string
  unit_price_sen: number
  qty: number
  modifiers_snapshot: ModifierSnapshot[]
  line_total_sen: number
  note: string | null
  status: OrderLineStatus
  void_reason: string | null
}

export interface Payment {
  id: UUID
  merchant_id: UUID
  order_id: UUID
  method: PaymentMethod
  amount_sen: number
  cash_received_sen: number | null
  change_sen: number | null
  reference: string | null
  created_at: ISODateTime
}

export interface Shift {
  id: UUID
  merchant_id: UUID
  outlet_id: UUID
  device_id: UUID
  opened_by: UUID
  opened_at: ISODateTime
  opening_float_sen: number
  closed_by: UUID | null
  closed_at: ISODateTime | null
  counted_cash_sen: number | null
  expected_cash_sen: number | null
  variance_sen: number | null
}

export interface AuditLog {
  id: UUID
  merchant_id: UUID
  staff_id: UUID
  action: string
  details: Record<string, unknown>
  created_at: ISODateTime
}

// Cloud-only: links a Supabase Auth user (the device's or owner's login) to the
// merchant(s) they belong to. RLS policies key off this table. Not synced to
// Dexie — the device already knows which merchant it is once signed in.
export interface UserMerchant {
  user_id: UUID
  merchant_id: UUID
}

// Local-only: a pending push to Supabase (CLAUDE.md section 8). `upsert`
// carries the full row; `delete` carries just enough columns to identify it
// (usually `{ id }`, but e.g. `{ outlet_id }` for settings or
// `{ item_id, group_id }` for item_modifier_groups).
export type SyncOp = 'upsert' | 'delete'

export interface SyncQueueItem {
  id: UUID
  table: string
  op: SyncOp
  payload: Record<string, unknown>
  created_at: ISODateTime
  // Monotonically increasing — the authoritative processing order. Two
  // items enqueued in the same millisecond have identical `created_at`, so
  // drain order must key off this instead (see lib/sequence.ts).
  seq: number
  attempts: number
  last_error: string | null
}
