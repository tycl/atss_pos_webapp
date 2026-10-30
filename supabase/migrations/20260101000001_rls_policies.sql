-- Row Level Security: a merchant must never be able to see another
-- merchant's data (CLAUDE.md section 4).
--
-- Auth model: staff PINs are a local-only UI gate on an already-authenticated
-- device (CLAUDE.md section 5) — PINs never reach Supabase Auth. The actual
-- RLS principal is whichever Supabase Auth user is signed in on the device
-- (set up once per device) or the owner's own login on the back-office web.
-- `user_merchants` links that auth user to the merchant(s) they may act as.

-- ============================================================================
-- helper: is the current auth user a member of this merchant?
-- ============================================================================

create or replace function public.is_merchant_member(target_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_merchants um
    where um.user_id = auth.uid()
      and um.merchant_id = target_merchant_id
  );
$$;

-- ============================================================================
-- user_merchants: bootstrapping membership
-- ============================================================================

alter table public.user_merchants enable row level security;

create policy "users can see their own merchant memberships"
  on public.user_merchants for select
  using (user_id = auth.uid());

-- No insert/update/delete policy for authenticated users: membership rows are
-- only ever written by the link_owner_to_new_merchant trigger below (it runs
-- as this function's owner, which — being the table owner — bypasses RLS).

create or replace function public.link_owner_to_new_merchant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_merchants (user_id, merchant_id)
  values (auth.uid(), new.id);
  return new;
end;
$$;

create trigger link_owner_to_new_merchant
  after insert on public.merchants
  for each row
  execute function public.link_owner_to_new_merchant();

-- ============================================================================
-- merchants
-- ============================================================================

alter table public.merchants enable row level security;

create policy "members can view their merchant"
  on public.merchants for select
  using (public.is_merchant_member(id));

-- Sign-up: any authenticated user may create a merchant for themselves. The
-- link_owner_to_new_merchant trigger immediately grants them membership.
create policy "authenticated users can create a merchant"
  on public.merchants for insert
  with check (auth.uid() is not null);

create policy "members can update their merchant"
  on public.merchants for update
  using (public.is_merchant_member(id))
  with check (public.is_merchant_member(id));

create policy "members can delete their merchant"
  on public.merchants for delete
  using (public.is_merchant_member(id));

-- ============================================================================
-- standard per-table policies: every remaining table has merchant_id
-- ============================================================================

do $$
declare
  tbl text;
  tenant_tables text[] := array[
    'outlets',
    'devices',
    'staff',
    'settings',
    'categories',
    'items',
    'modifier_groups',
    'modifiers',
    'item_modifier_groups',
    'tables',
    'orders',
    'order_lines',
    'payments',
    'shifts',
    'audit_log'
  ];
begin
  foreach tbl in array tenant_tables loop
    execute format('alter table public.%I enable row level security;', tbl);

    execute format(
      $pol$create policy "members can select %1$s" on public.%1$I for select
        using (public.is_merchant_member(merchant_id));$pol$,
      tbl
    );

    execute format(
      $pol$create policy "members can insert %1$s" on public.%1$I for insert
        with check (public.is_merchant_member(merchant_id));$pol$,
      tbl
    );

    execute format(
      $pol$create policy "members can update %1$s" on public.%1$I for update
        using (public.is_merchant_member(merchant_id))
        with check (public.is_merchant_member(merchant_id));$pol$,
      tbl
    );

    execute format(
      $pol$create policy "members can delete %1$s" on public.%1$I for delete
        using (public.is_merchant_member(merchant_id));$pol$,
      tbl
    );
  end loop;
end;
$$;
