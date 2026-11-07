-- devices(outlet_id, receipt_prefix) uniqueness (see the migration of the
-- same name).
--
-- Run with the Supabase CLI against the local stack:
--   supabase start
--   supabase test db
--
-- NOTE: these tests have only been run on PGlite with a stand-in for pgTAP.
-- Please run `supabase test db` and confirm all assertions pass before
-- relying on this migration.

begin;
select plan(3);

-- ----------------------------------------------------------------------------
-- Setup (as postgres, which owns every table and bypasses RLS)
-- ----------------------------------------------------------------------------

insert into public.merchants (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Merchant A');

insert into public.outlets (id, merchant_id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Outlet A'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Outlet B');

insert into public.devices (id, merchant_id, outlet_id, label, receipt_prefix) values
  ('a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 'Till 1', 'D1');

-- ----------------------------------------------------------------------------

select lives_ok(
  $$insert into public.devices (merchant_id, outlet_id, label, receipt_prefix)
    values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
            'Till 2', 'D2')$$,
  'a second distinct prefix in the same outlet is allowed'
);

select throws_ok(
  $$insert into public.devices (merchant_id, outlet_id, label, receipt_prefix)
    values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
            'Till 3 (dup)', 'D1')$$,
  '23505',
  null,
  'a duplicate prefix in the same outlet is rejected'
);

select lives_ok(
  $$insert into public.devices (merchant_id, outlet_id, label, receipt_prefix)
    values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
            'Till 1 of Outlet B', 'D1')$$,
  'the same prefix is allowed in a different outlet'
);

select * from finish();
rollback;
