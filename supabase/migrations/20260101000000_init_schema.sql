-- Initial schema for the F&B POS (CLAUDE.md section 6).
-- Every table carries merchant_id directly (CLAUDE.md section 4), even where
-- section 6's column list didn't spell it out, so RLS policies can be
-- written uniformly in the next migration without joining through parents.

create extension if not exists pgcrypto;

-- ============================================================================
-- merchants / outlets / devices / staff
-- ============================================================================

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ssm_no text,
  sst_no text,
  address text,
  phone text,
  logo_url text,
  plan text,
  status text
);

-- Links a Supabase Auth user (an owner's login, or a device's login) to the
-- merchant(s) they may act as. Staff PINs are a separate, local-only gate on
-- top of an already-authenticated device session — PINs never touch Supabase
-- Auth or RLS.
create table public.user_merchants (
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  primary key (user_id, merchant_id)
);

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  address text,
  receipt_footer text
);

create index outlets_merchant_id_idx on public.outlets (merchant_id);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  label text not null,
  receipt_prefix text not null
);

create index devices_merchant_id_idx on public.devices (merchant_id);
create index devices_outlet_id_idx on public.devices (outlet_id);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  role text not null check (role in ('owner', 'manager', 'cashier')),
  pin_hash text not null,
  active boolean not null default true
);

create index staff_merchant_id_idx on public.staff (merchant_id);

-- ============================================================================
-- settings
-- ============================================================================

create table public.settings (
  outlet_id uuid primary key references public.outlets (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  sst_enabled boolean not null default false,
  sst_rate_bp integer not null default 0,
  service_charge_enabled boolean not null default false,
  service_charge_rate_bp integer not null default 0,
  cash_rounding_enabled boolean not null default false
);

create index settings_merchant_id_idx on public.settings (merchant_id);

-- ============================================================================
-- menu: categories / items / modifier groups / modifiers
-- ============================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create index categories_merchant_id_idx on public.categories (merchant_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null,
  price_sen integer not null,
  active boolean not null default true,
  sort_order integer not null default 0
);

create index items_merchant_id_idx on public.items (merchant_id);
create index items_category_id_idx on public.items (category_id);

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  required boolean not null default false,
  max_select integer not null default 1
);

create index modifier_groups_merchant_id_idx on public.modifier_groups (merchant_id);

create table public.modifiers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  name text not null,
  price_sen integer not null default 0
);

create index modifiers_merchant_id_idx on public.modifiers (merchant_id);
create index modifiers_group_id_idx on public.modifiers (group_id);

create table public.item_modifier_groups (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  primary key (item_id, group_id)
);

create index item_modifier_groups_merchant_id_idx on public.item_modifier_groups (merchant_id);

-- ============================================================================
-- tables (dine-in)
-- ============================================================================

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create index tables_merchant_id_idx on public.tables (merchant_id);
create index tables_outlet_id_idx on public.tables (outlet_id);

-- ============================================================================
-- orders / order_lines / payments
-- ============================================================================

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  order_no text not null,
  type text not null check (type in ('dine_in', 'takeaway')),
  table_id uuid references public.tables (id) on delete set null,
  status text not null check (status in ('open', 'paid', 'void')),
  subtotal_sen integer not null default 0,
  service_charge_sen integer not null default 0,
  sst_sen integer not null default 0,
  rounding_sen integer not null default 0,
  total_sen integer not null default 0,
  created_by uuid not null references public.staff (id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  synced_at timestamptz
);

create index orders_merchant_id_idx on public.orders (merchant_id);
create index orders_outlet_id_idx on public.orders (outlet_id);
create index orders_device_id_idx on public.orders (device_id);
create unique index orders_outlet_order_no_key on public.orders (outlet_id, order_no);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  item_id uuid not null references public.items (id),
  name_snapshot text not null,
  unit_price_sen integer not null,
  qty integer not null check (qty > 0),
  modifiers_snapshot jsonb not null default '[]'::jsonb,
  line_total_sen integer not null,
  note text,
  status text not null check (status in ('active', 'void')),
  void_reason text
);

create index order_lines_merchant_id_idx on public.order_lines (merchant_id);
create index order_lines_order_id_idx on public.order_lines (order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  method text not null check (method in ('cash', 'duitnow_qr')),
  amount_sen integer not null,
  cash_received_sen integer,
  change_sen integer,
  reference text,
  created_at timestamptz not null default now()
);

create index payments_merchant_id_idx on public.payments (merchant_id);
create index payments_order_id_idx on public.payments (order_id);

-- ============================================================================
-- shifts
-- ============================================================================

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  opened_by uuid not null references public.staff (id),
  opened_at timestamptz not null default now(),
  opening_float_sen integer not null default 0,
  closed_by uuid references public.staff (id),
  closed_at timestamptz,
  counted_cash_sen integer,
  expected_cash_sen integer,
  variance_sen integer
);

create index shifts_merchant_id_idx on public.shifts (merchant_id);
create index shifts_outlet_id_idx on public.shifts (outlet_id);

-- ============================================================================
-- audit_log
-- ============================================================================

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  staff_id uuid not null references public.staff (id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_merchant_id_idx on public.audit_log (merchant_id);
