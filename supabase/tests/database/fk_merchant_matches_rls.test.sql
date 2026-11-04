-- assert_fk_merchant_matches() must see the real row it's checking against,
-- not whatever RLS happens to let the calling session see — otherwise a
-- session with no access to the referenced row gets a misleading "references
-- missing X.id" instead of the real reason (an RLS rejection). The actual
-- outcome (reject the write) is the same either way; this only confirms the
-- *reason* reported is now correct (20261105000000_fk_merchant_matches_security_definer.sql).
--
-- Run with the Supabase CLI against the local stack:
--   supabase start
--   supabase test db
--
-- NOTE: these tests have only been run on PGlite with a stand-in for pgTAP.
-- Please run `supabase test db` and confirm all assertions pass before
-- relying on this migration.

begin;
select plan(2);

-- ----------------------------------------------------------------------------
-- Setup (as postgres, which bypasses RLS)
-- ----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000c01', 'nobody@test.local');

insert into public.merchants (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Merchant A');

insert into public.user_merchants (user_id, merchant_id) values
  ('00000000-0000-0000-0000-000000000a01', 'a0000000-0000-0000-0000-000000000001');
-- 'nobody' is deliberately a member of nothing.

insert into public.outlets (id, merchant_id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Outlet A');

-- ----------------------------------------------------------------------------
-- As a session with no membership anywhere: the outlet genuinely exists and
-- really does belong to merchant A, so the real reason this insert fails is
-- "you can't do that" (RLS, 42501) — never "that outlet doesn't exist".
-- ----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c01', true);

select throws_ok(
  $$insert into public.devices (merchant_id, outlet_id, label, receipt_prefix)
    values ('a0000000-0000-0000-0000-000000000001',
            'a1000000-0000-0000-0000-000000000001', 'Device A', 'A1')$$,
  '42501',
  null,
  'a session with no membership gets the real RLS rejection, not a false "missing outlet"'
);

-- ----------------------------------------------------------------------------
-- As the outlet's real owner: the same insert succeeds exactly as before —
-- security definer only changes what the trigger itself can see, not what
-- a legitimate member is allowed to write.
-- ----------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', true);

select lives_ok(
  $$insert into public.devices (merchant_id, outlet_id, label, receipt_prefix)
    values ('a0000000-0000-0000-0000-000000000001',
            'a1000000-0000-0000-0000-000000000001', 'Device A', 'A1')$$,
  'the outlet''s real owner can still create a device for it, unaffected by the fix'
);

select * from finish();
rollback;
