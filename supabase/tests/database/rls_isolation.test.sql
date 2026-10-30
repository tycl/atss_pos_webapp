-- Multi-tenant isolation tests (CLAUDE.md section 4: "Write tests for this").
--
-- Run with the Supabase CLI against the local stack:
--   supabase start
--   supabase test db
--
-- NOTE: these tests were written but could not be executed in the sandbox
-- that produced them — no Supabase CLI / Docker / psql was available there.
-- Please run `supabase test db` and confirm all assertions pass before
-- relying on this migration.

begin;
select plan(11);

-- ----------------------------------------------------------------------------
-- Setup (runs as the postgres role, which owns every table and bypasses RLS)
-- ----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.local');

insert into public.merchants (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Merchant A'),
  ('b0000000-0000-0000-0000-000000000001', 'Merchant B');

-- Membership would normally be created by the link_owner_to_new_merchant
-- trigger on sign-up; inserted directly here since these rows were created
-- as postgres (the trigger only fires for inserts done by an authenticated user).
insert into public.user_merchants (user_id, merchant_id) values
  ('00000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001');

insert into public.outlets (id, merchant_id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Outlet A'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Outlet B');

insert into public.categories (id, merchant_id, name, sort_order) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Drinks', 0),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Drinks', 0);

insert into public.items (id, merchant_id, category_id, name, price_sen) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001', 'Teh Ais', 250),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'b2000000-0000-0000-0000-000000000001', 'Kopi O', 250);

insert into public.staff (id, merchant_id, name, role, pin_hash) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Alice', 'owner', 'hash-a'),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'Bob', 'owner', 'hash-b');

insert into public.audit_log (id, merchant_id, staff_id, action) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a4000000-0000-0000-0000-000000000001', 'login'),
  ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'b4000000-0000-0000-0000-000000000001', 'login');

-- ----------------------------------------------------------------------------
-- As merchant A's user: can see only merchant A's rows
-- ----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select is(
  (select count(*)::int from public.merchants),
  1,
  'merchant A sees exactly one merchant (itself)'
);

select is(
  (select name from public.merchants limit 1),
  'Merchant A',
  'merchant A sees its own merchant row'
);

select is(
  (select count(*)::int from public.outlets where id = 'b1000000-0000-0000-0000-000000000001'),
  0,
  'merchant A cannot see merchant B''s outlet'
);

select is(
  (select count(*)::int from public.outlets where id = 'a1000000-0000-0000-0000-000000000001'),
  1,
  'merchant A can see its own outlet'
);

select is(
  (select count(*)::int from public.items where id = 'b3000000-0000-0000-0000-000000000001'),
  0,
  'merchant A cannot see merchant B''s items'
);

select is(
  (select count(*)::int from public.staff where id = 'b4000000-0000-0000-0000-000000000001'),
  0,
  'merchant A cannot see merchant B''s staff'
);

select is(
  (select count(*)::int from public.audit_log where id = 'b5000000-0000-0000-0000-000000000001'),
  0,
  'merchant A cannot see merchant B''s audit log'
);

-- Merchant A tries to smuggle a row into merchant B's tenant by setting
-- merchant_id = B on insert. The with-check clause must reject it.
select throws_ok(
  $$insert into public.categories (merchant_id, name, sort_order)
    values ('b0000000-0000-0000-0000-000000000001', 'Smuggled', 0)$$,
  '42501',
  null,
  'merchant A cannot insert a row tagged with merchant B''s merchant_id'
);

-- ----------------------------------------------------------------------------
-- As merchant B's user: symmetric checks
-- ----------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);

select is(
  (select count(*)::int from public.items where id = 'a3000000-0000-0000-0000-000000000001'),
  0,
  'merchant B cannot see merchant A''s items'
);

select is(
  (select count(*)::int from public.items where id = 'b3000000-0000-0000-0000-000000000001'),
  1,
  'merchant B can see its own items'
);

-- ----------------------------------------------------------------------------
-- Unauthenticated (no JWT sub set): sees nothing
-- ----------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '', true);

select is(
  (select count(*)::int from public.merchants),
  0,
  'an unauthenticated session sees no merchants at all'
);

select * from finish();
rollback;
