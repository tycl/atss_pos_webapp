-- Cross-reference consistency trigger tests (supabase/README.md's
-- "Cross-reference consistency" section).
--
-- Run with the Supabase CLI against the local stack:
--   supabase start
--   supabase test db
--
-- NOTE: these tests have only been run on PGlite with a stand-in for pgTAP.
-- Please run `supabase test db` and confirm all assertions pass before
-- relying on this migration.

begin;
select plan(20);

-- ----------------------------------------------------------------------------
-- Setup (as postgres, which owns every table — triggers still fire for the
-- owner/superuser; only RLS is bypassed, and RLS isn't what's under test here)
-- ----------------------------------------------------------------------------

insert into public.merchants (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Merchant A'),
  ('b0000000-0000-0000-0000-000000000001', 'Merchant B');

insert into public.outlets (id, merchant_id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Outlet A'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Outlet B');

insert into public.devices (id, merchant_id, outlet_id, label, receipt_prefix) values
  ('a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 'Device A', 'A1');

insert into public.staff (id, merchant_id, name, role, pin_hash) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Alice', 'owner', 'hash-a'),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'Bob', 'owner', 'hash-b');

insert into public.categories (id, merchant_id, name, sort_order) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Drinks', 0),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Drinks', 0);

insert into public.items (id, merchant_id, category_id, name, price_sen) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001', 'Teh Ais', 250);

insert into public.modifier_groups (id, merchant_id, name) values
  ('a2100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Sugar level'),
  ('b2100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Sugar level');

insert into public.tables (id, merchant_id, outlet_id, name) values
  ('a1200000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 'Table 1');

insert into public.orders
  (id, merchant_id, outlet_id, device_id, order_no, type, status, created_by) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000001',
   'A1-20260101-1', 'takeaway', 'open', 'a4000000-0000-0000-0000-000000000001');

insert into public.order_lines
  (id, merchant_id, order_id, item_id, name_snapshot, unit_price_sen, qty, line_total_sen, status)
  values
  ('a5100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a5000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   'Teh Ais', 250, 1, 250, 'active');

-- ----------------------------------------------------------------------------
-- devices.outlet_id -> outlets
-- ----------------------------------------------------------------------------

select throws_ok(
  $$insert into public.devices (merchant_id, outlet_id, label, receipt_prefix)
    values ('a0000000-0000-0000-0000-000000000001',
            'b1000000-0000-0000-0000-000000000001', 'Device X', 'X1')$$,
  null, null,
  'a device cannot be tagged with merchant A but point at merchant B''s outlet'
);

select lives_ok(
  $$update public.devices set label = 'Device A (front)'
    where id = 'a1100000-0000-0000-0000-000000000001'$$,
  'updating a device without changing outlet_id still passes the check'
);

select throws_ok(
  $$update public.devices set outlet_id = 'b1000000-0000-0000-0000-000000000001'
    where id = 'a1100000-0000-0000-0000-000000000001'$$,
  null, null,
  'repointing an existing device at another merchant''s outlet is rejected'
);

-- ----------------------------------------------------------------------------
-- settings.outlet_id -> outlets
-- ----------------------------------------------------------------------------

select throws_ok(
  $$insert into public.settings (outlet_id, merchant_id)
    values ('b1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001')$$,
  null, null,
  'settings cannot be tagged with merchant A but keyed on merchant B''s outlet'
);

select lives_ok(
  $$insert into public.settings (outlet_id, merchant_id)
    values ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001')$$,
  'settings for an outlet that really belongs to the same merchant is accepted'
);

-- ----------------------------------------------------------------------------
-- items.category_id -> categories
-- ----------------------------------------------------------------------------

select throws_ok(
  $$insert into public.items (merchant_id, category_id, name, price_sen)
    values ('a0000000-0000-0000-0000-000000000001',
            'b2000000-0000-0000-0000-000000000001', 'Smuggled', 100)$$,
  null, null,
  'an item cannot be tagged with merchant A but filed under merchant B''s category'
);

-- ----------------------------------------------------------------------------
-- modifiers.group_id -> modifier_groups
-- ----------------------------------------------------------------------------

select throws_ok(
  $$insert into public.modifiers (merchant_id, group_id, name)
    values ('a0000000-0000-0000-0000-000000000001',
            'b2100000-0000-0000-0000-000000000001', 'Less sugar')$$,
  null, null,
  'a modifier cannot be tagged with merchant A but filed under merchant B''s group'
);

-- ----------------------------------------------------------------------------
-- item_modifier_groups.item_id -> items, .group_id -> modifier_groups
-- ----------------------------------------------------------------------------

select lives_ok(
  $$insert into public.item_modifier_groups (merchant_id, item_id, group_id)
    values ('a0000000-0000-0000-0000-000000000001',
            'a3000000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001')$$,
  'linking an item to a modifier group that both really belong to merchant A is accepted'
);

select throws_ok(
  $$insert into public.item_modifier_groups (merchant_id, item_id, group_id)
    values ('b0000000-0000-0000-0000-000000000001',
            'a3000000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001')$$,
  null, null,
  'linking merchant B''s row to merchant A''s item is rejected'
);

-- ----------------------------------------------------------------------------
-- tables.outlet_id -> outlets
-- ----------------------------------------------------------------------------

select throws_ok(
  $$insert into public.tables (merchant_id, outlet_id, name)
    values ('a0000000-0000-0000-0000-000000000001',
            'b1000000-0000-0000-0000-000000000001', 'Smuggled table')$$,
  null, null,
  'a table cannot be tagged with merchant A but point at merchant B''s outlet'
);

-- ----------------------------------------------------------------------------
-- orders.outlet_id / .device_id / .table_id / .created_by
-- ----------------------------------------------------------------------------

select throws_ok(
  $$insert into public.orders
    (merchant_id, outlet_id, device_id, order_no, type, status, created_by) values
    ('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
     'a1100000-0000-0000-0000-000000000001', 'A1-20260101-2', 'takeaway', 'open',
     'a4000000-0000-0000-0000-000000000001')$$,
  null, null,
  'an order cannot point at another merchant''s outlet'
);

select throws_ok(
  $$insert into public.orders
    (merchant_id, outlet_id, device_id, order_no, type, status, created_by) values
    ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
     'a1100000-0000-0000-0000-000000000001', 'A1-20260101-3', 'takeaway', 'open',
     'b4000000-0000-0000-0000-000000000001')$$,
  null, null,
  'an order cannot be created_by another merchant''s staff'
);

select lives_ok(
  $$insert into public.orders
    (merchant_id, outlet_id, device_id, order_no, type, table_id, status, created_by) values
    ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
     'a1100000-0000-0000-0000-000000000001', 'A1-20260101-4', 'dine_in',
     'a1200000-0000-0000-0000-000000000001', 'open', 'a4000000-0000-0000-0000-000000000001')$$,
  'an order with a table_id that really belongs to the same merchant is accepted'
);

select lives_ok(
  $$insert into public.orders
    (merchant_id, outlet_id, device_id, order_no, type, table_id, status, created_by) values
    ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
     'a1100000-0000-0000-0000-000000000001', 'A1-20260101-5', 'takeaway', null, 'open',
     'a4000000-0000-0000-0000-000000000001')$$,
  'a takeaway order with a null table_id is never inconsistent'
);

-- ----------------------------------------------------------------------------
-- order_lines.order_id -> orders, .item_id -> items
-- ----------------------------------------------------------------------------

select throws_ok(
  $$insert into public.order_lines
    (merchant_id, order_id, item_id, name_snapshot, unit_price_sen, qty, line_total_sen, status)
    values ('b0000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001',
            'a3000000-0000-0000-0000-000000000001', 'Teh Ais', 250, 1, 250, 'active')$$,
  null, null,
  'an order line cannot be tagged with merchant B but point at merchant A''s order'
);

-- ----------------------------------------------------------------------------
-- payments.order_id -> orders
-- ----------------------------------------------------------------------------

select throws_ok(
  $$insert into public.payments (merchant_id, order_id, method, amount_sen)
    values ('b0000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001',
            'cash', 250)$$,
  null, null,
  'a payment cannot be tagged with merchant B but point at merchant A''s order'
);

select lives_ok(
  $$insert into public.payments (merchant_id, order_id, method, amount_sen)
    values ('a0000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001',
            'cash', 250)$$,
  'a payment for an order that really belongs to the same merchant is accepted'
);

-- ----------------------------------------------------------------------------
-- shifts.outlet_id / .device_id / .opened_by / .closed_by
-- ----------------------------------------------------------------------------

select throws_ok(
  $$insert into public.shifts (merchant_id, outlet_id, device_id, opened_by)
    values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
            'a1100000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001')$$,
  null, null,
  'a shift cannot be opened_by another merchant''s staff'
);

select lives_ok(
  $$insert into public.shifts (merchant_id, outlet_id, device_id, opened_by)
    values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
            'a1100000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$,
  'a shift with no closed_by yet (still open) is never inconsistent on that column'
);

-- ----------------------------------------------------------------------------
-- audit_log.staff_id -> staff
-- ----------------------------------------------------------------------------

select throws_ok(
  $$insert into public.audit_log (merchant_id, staff_id, action)
    values ('a0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001',
            'login')$$,
  null, null,
  'an audit log entry cannot be tagged with merchant A but attributed to merchant B''s staff'
);

select * from finish();
rollback;
