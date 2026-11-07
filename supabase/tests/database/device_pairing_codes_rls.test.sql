-- device_pairing_codes RLS + cross-reference consistency (see the
-- migration of the same name).
--
-- Run with the Supabase CLI against the local stack:
--   supabase start
--   supabase test db
--
-- NOTE: these tests have only been run on PGlite with a stand-in for pgTAP.
-- Please run `supabase test db` and confirm all assertions pass before
-- relying on this migration.

begin;
select plan(6);

-- ----------------------------------------------------------------------------
-- Setup (as postgres, which owns every table and bypasses RLS)
-- ----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.local');

insert into public.merchants (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Merchant A'),
  ('b0000000-0000-0000-0000-000000000001', 'Merchant B');

insert into public.user_merchants (user_id, merchant_id) values
  ('00000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001');

insert into public.outlets (id, merchant_id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Outlet A'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Outlet B');

insert into public.devices (id, merchant_id, outlet_id, label, receipt_prefix) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 'Till A1', 'D1'),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001', 'Till B1', 'D1');

insert into public.device_pairing_codes
  (id, merchant_id, outlet_id, device_id, code_hash, expires_at) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'hash-a', now() + interval '10 minutes');

-- ----------------------------------------------------------------------------
-- As merchant A's own member: full CRUD on its own merchant's rows
-- ----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select is(
  (select count(*)::int from public.device_pairing_codes),
  1,
  'merchant A''s member sees merchant A''s pairing code'
);

select lives_ok(
  $$insert into public.device_pairing_codes
    (id, merchant_id, outlet_id, device_id, code_hash, expires_at) values
    ('a3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
     'hash-a2', now() + interval '10 minutes')$$,
  'merchant A''s member can create a pairing code for merchant A''s own till'
);

select throws_ok(
  $$insert into public.device_pairing_codes
    (merchant_id, outlet_id, device_id, code_hash, expires_at) values
    ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
     'b2000000-0000-0000-0000-000000000001', 'hash-bad', now() + interval '10 minutes')$$,
  null, null,
  'a pairing code tagged merchant A cannot point at merchant B''s device'
);

select lives_ok(
  $$update public.device_pairing_codes set used_at = now()
    where id = 'a3000000-0000-0000-0000-000000000002'$$,
  'merchant A''s member can update merchant A''s own pairing code'
);

-- ----------------------------------------------------------------------------
-- As merchant B's own member: merchant A's row is invisible, and an update
-- aimed at it silently affects nothing
-- ----------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);

select is(
  (select count(*)::int from public.device_pairing_codes
   where id = 'a3000000-0000-0000-0000-000000000001'),
  0,
  'merchant B''s member cannot see merchant A''s pairing code'
);

update public.device_pairing_codes set used_at = now()
  where id = 'a3000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select is(
  (select used_at from public.device_pairing_codes
   where id = 'a3000000-0000-0000-0000-000000000001'),
  null,
  'merchant B''s member''s update of merchant A''s row silently affected no rows'
);

select * from finish();
rollback;
