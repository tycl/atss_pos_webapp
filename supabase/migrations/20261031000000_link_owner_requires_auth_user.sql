-- link_owner_to_new_merchant inserted auth.uid() unconditionally, so any merchant
-- created without an auth user (the postgres role in the dashboard, seed scripts,
-- the pgTAP setup) failed on user_merchants.user_id being null. There is nobody
-- to link in that case, so skip it. The insert policy on merchants already
-- requires auth.uid() for API users, so this doesn't change their path.

create or replace function public.link_owner_to_new_merchant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    insert into public.user_merchants (user_id, merchant_id)
    values (auth.uid(), new.id);
  end if;
  return new;
end;
$$;
