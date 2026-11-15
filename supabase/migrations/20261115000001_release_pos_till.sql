-- Graceful till release: nulls session_id/last_seen_at so the next claim
-- succeeds immediately, instead of waiting for the 2-minute stale window.
-- Called by navigator.sendBeacon on beforeunload/visibilitychange
-- (CLAUDE.md section 12a).
--
-- The session_id check prevents a delayed beacon (slow network) from
-- clearing a session that a different browser has legitimately claimed
-- since this tab started closing.

create or replace function public.release_pos_till(
  p_device_id uuid,
  p_session_id text
)
returns jsonb
language plpgsql
as $$
begin
  update public.devices
     set session_id   = null,
         last_seen_at = null
   where id = p_device_id
     and session_id = p_session_id;

  if found then
    return jsonb_build_object('status', 'released');
  else
    return jsonb_build_object('status', 'no_match');
  end if;
end;
$$;

grant execute on function public.release_pos_till(uuid, text) to authenticated;
