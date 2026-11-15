-- Atomic till claim: prevents two browsers from using the same device
-- simultaneously, which would produce duplicate receipt numbers
-- (CLAUDE.md section 12a, 12b).
--
-- Called by heartbeat.ts on the first beat when a browser starts using
-- a till. Uses SELECT ... FOR UPDATE to serialize concurrent claims on
-- the same device row.

create or replace function public.claim_pos_till(
  p_device_id uuid,
  p_session_id text,
  p_user_agent text default null,
  p_stale_window interval default interval '2 minutes'
)
returns jsonb
language plpgsql
as $$
declare
  v_device record;
begin
  select session_id, last_seen_at
    into v_device
    from public.devices
   where id = p_device_id
     for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Another session is alive (heartbeated within the stale window)
  if v_device.session_id is not null
     and v_device.session_id <> p_session_id
     and v_device.last_seen_at is not null
     and v_device.last_seen_at > now() - p_stale_window
  then
    return jsonb_build_object(
      'status', 'conflict',
      'active_session_id', v_device.session_id,
      'last_seen_at', v_device.last_seen_at
    );
  end if;

  -- Clear any stale force-reclaim flag: its purpose (evicting the
  -- previous session) is already served since no active session exists.
  update public.devices
     set session_id                = p_session_id,
         last_seen_at              = now(),
         user_agent                = coalesce(p_user_agent, user_agent),
         force_reclaim_requested_at = null
   where id = p_device_id;

  return jsonb_build_object('status', 'claimed');
end;
$$;

grant execute on function public.claim_pos_till(uuid, text, text, interval) to authenticated;
