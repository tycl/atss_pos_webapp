-- Prevents two devices in the same outlet from ever sharing a receipt
-- prefix (CLAUDE.md section 7: "<device prefix>-<YYYYMMDD>-<running no>"
-- must be unique per outlet to keep receipt numbers unique). Previously
-- features/device/api.ts derived receipt_prefix from a local Dexie count
-- only, so two browsers creating a till for the same outlet while offline
-- could independently pick the same prefix with nothing to catch it. This
-- constraint makes that collision visible (a 23505 on the devices upsert)
-- instead of silently producing duplicate receipt numbers; the sync queue's
-- error handling auto-recovers from that specific case by re-rolling a free
-- prefix and retrying.

-- Resolve any duplicates that already exist before the constraint below can
-- be added — confirmed live on this project: an outlet with two devices
-- both minted as "D1" by the old per-browser-count logic. For every
-- duplicate (outlet_id, receipt_prefix) group, the first row (arbitrarily,
-- by id) keeps its prefix; every other row in the group is reassigned the
-- next prefix not already used in that outlet. This never touches any
-- existing order: order numbers are snapshotted into orders.order_no at
-- creation time (CLAUDE.md section 7), not recomputed from the device's
-- current receipt_prefix, so renaming a device here doesn't change any
-- receipt that's already been issued.
do $$
declare
  dup record;
  stale_device record;
  next_n int;
  new_prefix text;
begin
  for dup in
    select outlet_id, receipt_prefix
    from public.devices
    group by outlet_id, receipt_prefix
    having count(*) > 1
  loop
    next_n := 1;
    for stale_device in
      select id
      from public.devices
      where outlet_id = dup.outlet_id and receipt_prefix = dup.receipt_prefix
      order by id
      offset 1
    loop
      loop
        new_prefix := 'D' || next_n;
        exit when not exists (
          select 1 from public.devices
          where outlet_id = dup.outlet_id and receipt_prefix = new_prefix
        );
        next_n := next_n + 1;
      end loop;
      update public.devices set receipt_prefix = new_prefix where id = stale_device.id;
      next_n := next_n + 1;
    end loop;
  end loop;
end;
$$;

alter table public.devices
  add constraint devices_outlet_receipt_prefix_unique unique (outlet_id, receipt_prefix);
