-- 6-digit, single-use, 10-minute pairing codes: an alternative to the
-- "pick an existing till from a dropdown" quick-claim in ClaimDeviceModal,
-- for when the owner wants to deliberately point ONE specific new browser
-- at ONE specific existing till (generated from the Back office Tills
-- page). The redeeming browser is already signed in for the merchant (same
-- as the dropdown today) — this isn't an unauthenticated bootstrap, so a
-- plain merchant-scoped table under the existing RLS helper is enough; no
-- service-role Edge Function needed.
create table public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  -- Hashed with the same salted-SHA-256 scheme as staff.pin_hash (lib/pin.ts)
  -- rather than stored in plaintext — defense in depth for a secret meant
  -- to be single-use, even though it's merchant-scoped and RLS-protected.
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_session_id text
);

create index device_pairing_codes_merchant_id_idx on public.device_pairing_codes (merchant_id);
create index device_pairing_codes_outlet_id_idx on public.device_pairing_codes (outlet_id);

alter table public.device_pairing_codes enable row level security;

create policy "members can select device_pairing_codes"
  on public.device_pairing_codes for select
  using (public.is_merchant_member(merchant_id));

create policy "members can insert device_pairing_codes"
  on public.device_pairing_codes for insert
  with check (public.is_merchant_member(merchant_id));

create policy "members can update device_pairing_codes"
  on public.device_pairing_codes for update
  using (public.is_merchant_member(merchant_id))
  with check (public.is_merchant_member(merchant_id));

create policy "members can delete device_pairing_codes"
  on public.device_pairing_codes for delete
  using (public.is_merchant_member(merchant_id));

-- Same cross-reference consistency guarantee as every other outlet/device FK
-- (20261102000000_merchant_consistency_triggers.sql).
create trigger device_pairing_codes_outlet_merchant_matches
  before insert or update on public.device_pairing_codes
  for each row execute function public.assert_fk_merchant_matches('outlet_id', 'outlets');

create trigger device_pairing_codes_device_merchant_matches
  before insert or update on public.device_pairing_codes
  for each row execute function public.assert_fk_merchant_matches('device_id', 'devices');
