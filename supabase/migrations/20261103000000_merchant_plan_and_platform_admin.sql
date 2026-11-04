-- Subscription tiers (Basic = device-only, never syncs; Standard = syncs to
-- Supabase as today) and a platform-admin portal for the product owner to
-- manage every merchant's plan/status/subscription period and see a
-- dashboard of all customers. CLAUDE.md's `merchants (..., plan, status)`
-- columns already exist but have been free-form, unset text since the
-- initial schema — this migration gives them real values and adds the
-- subscription period fields the admin portal needs.

-- ============================================================================
-- merchants.plan / merchants.status: give the existing columns real values
-- ============================================================================

-- Backfill first so the NOT NULL below doesn't orphan any existing row (e.g.
-- a dev/seed merchant created before this migration). 'standard' matches
-- today's actual behavior (every merchant already syncs), so backfilling to
-- it changes nothing observable for existing merchants.
update public.merchants
  set plan = coalesce(plan, 'standard'),
      status = coalesce(status, 'active');

alter table public.merchants
  add constraint merchants_plan_check check (plan in ('basic', 'standard')),
  add constraint merchants_status_check check (status in ('active', 'suspended')),
  alter column plan set default 'standard',
  alter column status set default 'active',
  alter column plan set not null,
  alter column status set not null;

-- Null = no subscription period set yet (the admin hasn't configured one).
-- No lockout behavior is attached to these dates yet — the admin dashboard
-- just flags an expired merchant for manual review (CLAUDE.md's MVP scope
-- has no billing/payment gateway to automate this against).
alter table public.merchants
  add column subscription_started_at timestamptz,
  add column subscription_expires_at timestamptz;

-- ============================================================================
-- platform_admins: the product owner's own cross-merchant access
-- ============================================================================

-- Deliberately separate from user_merchants: a platform admin manages every
-- merchant and is not a member of any of them. One row, seeded manually via
-- the Supabase SQL editor (service role bypasses RLS) after creating the
-- admin's own Supabase Auth user — mirrors how user_merchants rows are
-- normally only ever written by a trigger, never by application code.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.platform_admins enable row level security;

create policy "admins can see their own platform_admins row"
  on public.platform_admins for select
  using (user_id = auth.uid());

-- No insert/update/delete policy for authenticated users: this table is only
-- ever written by hand (service role) by the product owner.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

-- ============================================================================
-- platform-admin read/write access
-- ============================================================================

-- Full read/write on merchants (change plan/status/subscription dates). No
-- insert/delete policy: merchants are created only via the existing owner
-- sign-up flow, never by the admin portal.
create policy "platform admins can view all merchants"
  on public.merchants for select
  using (public.is_platform_admin());

create policy "platform admins can update all merchants"
  on public.merchants for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Read-only access to outlets/devices, just enough for the dashboard's
-- per-merchant outlet/device counts. Deliberately not extended to
-- orders/payments/staff/etc. — nothing the admin portal does needs
-- transactional data, and granting cross-merchant read on it would be scope
-- beyond what was asked for a single-admin tool.
create policy "platform admins can view all outlets"
  on public.outlets for select
  using (public.is_platform_admin());

create policy "platform admins can view all devices"
  on public.devices for select
  using (public.is_platform_admin());
