-- CLAUDE.md section 7: "Voids and discounts: require manager/owner PIN and
-- a reason; always logged in audit_log." Section 6's schema listing for
-- `orders` didn't include a discount column, so adding it here. Applied
-- before service charge/SST (see calculateTotals.ts), on open orders only.

alter table public.orders
  add column discount_sen integer not null default 0,
  add column discount_reason text;

alter table public.orders
  add constraint orders_discount_sen_non_negative check (discount_sen >= 0);
