-- supabase/README.md's "Known gap": RLS (previous migration) guarantees a
-- merchant can't read/write another merchant's rows, but nothing enforces
-- that a row's *own* foreign keys agree on which merchant they belong to —
-- e.g. a device's outlet_id could point at an outlet owned by a different
-- merchant than the device's own merchant_id. That would be a bug, not an
-- attack (RLS already stops the attack case), but it would silently corrupt
-- reports and RLS scoping for that row. This migration adds a trigger that
-- rejects any insert/update where a foreign key's target disagrees with the
-- row's own merchant_id.

-- Generic: works for any (table, fk_column, referenced_table) combination
-- because every table in this schema keys its rows on `id` and tags them
-- with `merchant_id` directly (CLAUDE.md section 4). Pass the FK column name
-- and the table it references as trigger arguments. A null FK value (e.g.
-- orders.table_id, shifts.closed_by) is allowed through — "no reference" is
-- never inconsistent.
create or replace function public.assert_fk_merchant_matches()
returns trigger
language plpgsql
as $$
declare
  fk_column text := TG_ARGV[0];
  ref_table text := TG_ARGV[1];
  fk_value uuid;
  ref_merchant_id uuid;
begin
  fk_value := (to_jsonb(NEW) ->> fk_column)::uuid;
  if fk_value is null then
    return NEW;
  end if;

  execute format('select merchant_id from public.%I where id = $1', ref_table)
    into ref_merchant_id
    using fk_value;

  if ref_merchant_id is null then
    raise exception '%.% references missing %.id = %',
      TG_TABLE_NAME, fk_column, ref_table, fk_value;
  end if;

  if ref_merchant_id <> NEW.merchant_id then
    raise exception '%.% (%) belongs to merchant %, but this row''s merchant_id is %',
      TG_TABLE_NAME, fk_column, fk_value, ref_merchant_id, NEW.merchant_id;
  end if;

  return NEW;
end;
$$;

-- devices.outlet_id -> outlets
create trigger devices_outlet_merchant_matches
  before insert or update on public.devices
  for each row execute function public.assert_fk_merchant_matches('outlet_id', 'outlets');

-- settings.outlet_id -> outlets
create trigger settings_outlet_merchant_matches
  before insert or update on public.settings
  for each row execute function public.assert_fk_merchant_matches('outlet_id', 'outlets');

-- items.category_id -> categories
create trigger items_category_merchant_matches
  before insert or update on public.items
  for each row execute function public.assert_fk_merchant_matches('category_id', 'categories');

-- modifiers.group_id -> modifier_groups
create trigger modifiers_group_merchant_matches
  before insert or update on public.modifiers
  for each row execute function public.assert_fk_merchant_matches('group_id', 'modifier_groups');

-- item_modifier_groups.item_id -> items, .group_id -> modifier_groups
create trigger item_modifier_groups_item_merchant_matches
  before insert or update on public.item_modifier_groups
  for each row execute function public.assert_fk_merchant_matches('item_id', 'items');

create trigger item_modifier_groups_group_merchant_matches
  before insert or update on public.item_modifier_groups
  for each row execute function public.assert_fk_merchant_matches('group_id', 'modifier_groups');

-- tables.outlet_id -> outlets
create trigger tables_outlet_merchant_matches
  before insert or update on public.tables
  for each row execute function public.assert_fk_merchant_matches('outlet_id', 'outlets');

-- orders.outlet_id -> outlets, .device_id -> devices, .table_id -> tables
-- (nullable), .created_by -> staff
create trigger orders_outlet_merchant_matches
  before insert or update on public.orders
  for each row execute function public.assert_fk_merchant_matches('outlet_id', 'outlets');

create trigger orders_device_merchant_matches
  before insert or update on public.orders
  for each row execute function public.assert_fk_merchant_matches('device_id', 'devices');

create trigger orders_table_merchant_matches
  before insert or update on public.orders
  for each row execute function public.assert_fk_merchant_matches('table_id', 'tables');

create trigger orders_created_by_merchant_matches
  before insert or update on public.orders
  for each row execute function public.assert_fk_merchant_matches('created_by', 'staff');

-- order_lines.order_id -> orders, .item_id -> items
create trigger order_lines_order_merchant_matches
  before insert or update on public.order_lines
  for each row execute function public.assert_fk_merchant_matches('order_id', 'orders');

create trigger order_lines_item_merchant_matches
  before insert or update on public.order_lines
  for each row execute function public.assert_fk_merchant_matches('item_id', 'items');

-- payments.order_id -> orders
create trigger payments_order_merchant_matches
  before insert or update on public.payments
  for each row execute function public.assert_fk_merchant_matches('order_id', 'orders');

-- shifts.outlet_id -> outlets, .device_id -> devices, .opened_by -> staff,
-- .closed_by -> staff (nullable)
create trigger shifts_outlet_merchant_matches
  before insert or update on public.shifts
  for each row execute function public.assert_fk_merchant_matches('outlet_id', 'outlets');

create trigger shifts_device_merchant_matches
  before insert or update on public.shifts
  for each row execute function public.assert_fk_merchant_matches('device_id', 'devices');

create trigger shifts_opened_by_merchant_matches
  before insert or update on public.shifts
  for each row execute function public.assert_fk_merchant_matches('opened_by', 'staff');

create trigger shifts_closed_by_merchant_matches
  before insert or update on public.shifts
  for each row execute function public.assert_fk_merchant_matches('closed_by', 'staff');

-- audit_log.staff_id -> staff
create trigger audit_log_staff_merchant_matches
  before insert or update on public.audit_log
  for each row execute function public.assert_fk_merchant_matches('staff_id', 'staff');
