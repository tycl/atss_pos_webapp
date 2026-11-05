-- Lets the platform admin mark a stale/duplicate device row inactive
-- without deleting it — a device row is created lazily per-browser
-- (features/device/api.ts's ensureActiveDevice) with no setup wizard and no
-- cleanup, so testing/incognito/cache-clears can leave a merchant with far
-- more device rows than real counters. Deactivating keeps order_lines'/
-- shifts' historical device_id references intact; it only changes what the
-- admin dashboard counts and lists as current.

alter table public.devices
  add column active boolean not null default true;

-- Platform admins already have select on devices (previous migration);
-- this adds update so the admin portal can flip `active`. Whole-row, same
-- as "platform admins can update all merchants" for plan/status — RLS has
-- no column-level granularity, and nothing else on this table is editable
-- from the admin portal anyway.
create policy "platform admins can update devices"
  on public.devices for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
