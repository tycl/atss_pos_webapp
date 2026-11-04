-- assert_fk_merchant_matches() (20261102000000_merchant_consistency_triggers.sql)
-- looks up the referenced row's merchant_id with a plain SELECT, subject to
-- RLS on whoever is currently making the request. If that session isn't (or
-- is no longer) a member of the referenced row's merchant, the lookup finds
-- 0 rows even when the row genuinely exists, and the trigger raises the
-- misleading "references missing X.id" — when the real reason is "you can't
-- see this row", not "it doesn't exist". The write would still correctly be
-- rejected either way (the table's own RLS with-check policy catches it),
-- so this only fixes the error message, not the behavior: add security
-- definer + a locked-down search_path, the same hardening is_merchant_member
-- already uses, so the lookup sees the real row and only raises "missing"
-- when it truly is.

create or replace function public.assert_fk_merchant_matches()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fk_column text := TG_ARGV[0];
  ref_table text := TG_ARGV[1];
  fk_value uuid;
  ref_merchant_id uuid;
begin
  fk_value := (to_jsonb(NEW) ->> fk_column)::uuid;
  if fk_value is null then
    return NEW;
  end if;

  execute format('select merchant_id from public.%I where id = $1', ref_table)
    into ref_merchant_id
    using fk_value;

  if ref_merchant_id is null then
    raise exception '%.% references missing %.id = %',
      TG_TABLE_NAME, fk_column, ref_table, fk_value;
  end if;

  if ref_merchant_id <> NEW.merchant_id then
    raise exception '%.% (%) belongs to merchant %, but this row''s merchant_id is %',
      TG_TABLE_NAME, fk_column, fk_value, ref_merchant_id, NEW.merchant_id;
  end if;

  return NEW;
end;
$$;
