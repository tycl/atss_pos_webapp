-- Presence/ownership telemetry for a claimed till, written periodically
-- while its browser tab is open (features/device/heartbeat.ts). Lets a
-- till warn (non-blocking) if another browser's session is heartbeating the
-- same device row right now, and gives an owner-initiated "force re-claim"
-- primitive the till itself picks up on its next heartbeat round-trip
-- (features/device/pages/TillsManagementPage.tsx, a later phase).
alter table public.devices
  add column last_seen_at timestamptz,
  add column session_id text,
  add column user_agent text,
  add column force_reclaim_requested_at timestamptz;

-- No RLS change needed: merchant members already have full update on
-- devices via the generic tenant-table policy
-- (20260101000001_rls_policies.sql) — both the till's own heartbeat writer
-- and the owner's Tills page act as merchant members.
