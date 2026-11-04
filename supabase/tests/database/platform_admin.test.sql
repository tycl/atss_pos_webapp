-- Platform-admin cross-merchant access tests.
--
-- Run with the Supabase CLI against the local stack:
--   supabase start
--   supabase test db
--
-- NOTE: these tests have only been run on PGlite with a stand-in for pgTAP.
-- Please run `supabase test db` and confirm all assertions pass before
-- relying on this migration.

begin;
select plan(7);

-- ----------------------------------------------------------------------------
-- Setup (runs as the postgres role, which owns every table and bypasses RLS)
-- ----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.local'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local');

insert into public.merchants (id, name, plan, status) values
  ('a0000000-0000-0000-0000-000000000001', 'Merchant A', 'standard', 'active'),
  ('b0000000-0000-0000-0000-000000000001', 'Merchant B', 'basic', 'active');

insert into public.user_merchants (user_id, merchant_id) values
  ('00000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001');

insert into public.platform_admins (user_id) values
  ('00000000-0000-0000-0000-0000000000ad');

insert into public.outlets (id, merchant_id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Outlet A'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Outlet B');

-- ----------------------------------------------------------------------------
-- As the platform admin: can see and update every merchant, and the counts
-- the dashboard needs
-- ----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);

select is(
  (select count(*)::int from public.merchants),
  2,
  'platform admin sees every merchant'
);

select is(
  (select count(*)::int from public.outlets),
  2,
  'platform admin sees every outlet (for the dashboard''s device/outlet counts)'
);

select lives_ok(
  $$update public.merchants set plan = 'standard'
    where id = 'b0000000-0000-0000-0000-000000000001'$$,
  'platform admin can change a merchant''s plan'
);

select is(
  (select plan from public.merchants where id = 'b0000000-0000-0000-0000-000000000001'),
  'standard',
  'the plan change actually took effect'
);

-- ----------------------------------------------------------------------------
-- Regression: an ordinary merchant user is still fully isolated
-- (is_merchant_member-only policies must be untouched by this migration)
-- ----------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select is(
  (select count(*)::int from public.merchants),
  1,
  'an ordinary merchant user still sees only its own merchant'
);

select is(
  (select count(*)::int from public.outlets where id = 'b1000000-0000-0000-0000-000000000001'),
  0,
  'an ordinary merchant user still cannot see another merchant''s outlet'
);

-- An update's USING clause just filters which rows are matched, so this
-- doesn't throw — it silently affects zero rows. Confirm that by switching
-- back to the platform admin and checking the value was never changed.
update public.merchants set plan = 'basic'
  where id = 'b0000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);

select is(
  (select plan from public.merchants where id = 'b0000000-0000-0000-0000-000000000001'),
  'standard',
  'an ordinary merchant user''s update of another merchant''s plan silently affected no rows'
);

select * from finish();
rollback;
