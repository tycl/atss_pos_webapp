# CLAUDE.md — F&B POS (Basic Version / MVP)

## 1. Project overview

A point-of-sale system for small F&B businesses in Malaysia
(cafés, kopitiam, bubble tea, quick-service restaurants), sold as a product
on a monthly subscription. Runs on an Android tablet at the counter.

MVP goal: one outlet can take orders, print kitchen tickets and receipts,
accept cash and DuitNow QR, and close the day with a sales report —
**even when the internet is down.**

The POS ships as two targets from the same codebase and the same local/cloud
data model: an Android tablet app (Capacitor) and a browser-based web app
(any device with a modern browser, e.g. a counter PC or laptop). Both are
full POS — not just back-office — and share identical Dexie/Supabase schemas.

Out of scope for MVP (later versions): kitchen display screen, QR self-ordering,
multi-branch, delivery app integration, card terminal integration, e-invoice,
inventory/recipe deduction, loyalty.

## 2. Tech stack (do not change without asking)

- Frontend: React + TypeScript, Vite, React Router, Tailwind CSS
- Offline storage: IndexedDB via Dexie (local-first; every write goes here first)
- Cloud backend: Supabase (Postgres, Auth, Row Level Security, Edge Functions)
- Android packaging: Capacitor (needed for direct printer access on the tablet)
- Web POS packaging: same React app, no Capacitor, runs in a browser
- Printing: ESC/POS thermal printers (Bluetooth, USB, or LAN), behind one
  printing interface with two implementations:
  - Android: a Capacitor plugin talking to the printer directly
    — propose plugin options and ask before installing
  - Web: a local print-bridge agent (small helper process on a counter
    PC/network) that the browser calls over LAN HTTP; the agent forwards
    raw ESC/POS bytes to the printer and handles the cash drawer kick
    — propose agent implementation and ask before building/installing it
- Back-office (owner) web: same React app, owner routes, works on browser
- Package manager: npm | Lint/format: ESLint + Prettier | Tests: Vitest

## 3. Coding rules

- Functional style only. No classes.
- Strict TypeScript. No `any` unless commented with a reason.
- Money is stored as integer **sen** (RM 12.50 = 1250). Never use floats for money.
- All secrets in environment variables.
- Run `npm run lint` and `npm test` before saying a task is done.
- NEVER run `git commit` or `git push` without asking the user first.
- Ask before adding any new npm dependency.

## 4. Multi-tenant from day one

This is a product sold to many shops. Every table has `merchant_id`
(and `outlet_id` where relevant). RLS must ensure a merchant can only
ever see its own data. Write tests for this.

## 5. User roles

| Role    | Can do                                                        |
| ------- | ------------------------------------------------------------- |
| owner   | Everything: menu, prices, tax settings, staff, reports, voids |
| manager | Approve voids/discounts (PIN), open/close shift, view reports |
| cashier | Take orders, accept payment, print receipts                   |

Staff log in on the tablet with a 4–6 digit PIN (device already signed in to the merchant).

## 6. Data model

Cloud (Postgres) and local (Dexie) use the same shapes.

- `merchants` (id, name, ssm_no, sst_no, address, phone, logo_url, plan, status)
- `outlets` (id, merchant_id, name, address, receipt_footer)
- `devices` (id, outlet_id, label, receipt_prefix e.g. "T1")
- `staff` (id, merchant_id, name, role, pin_hash, active)
- `settings` (outlet_id, sst_enabled, sst_rate_bp, service_charge_enabled,
  service_charge_rate_bp, cash_rounding_enabled) — rates in basis points (6% = 600)
- `categories` (id, merchant_id, name, sort_order)
- `items` (id, merchant_id, category_id, name, price_sen, active, sort_order)
- `modifier_groups` (id, merchant_id, name, required, max_select) e.g. "Sugar level"
- `modifiers` (id, group_id, name, price_sen) e.g. "Less sugar" (0), "Extra shot" (+150)
- `item_modifier_groups` (item_id, group_id)
- `tables` (id, outlet_id, name, sort_order)
- `orders` (id, outlet_id, device_id, order_no, type [dine_in|takeaway], table_id,
  status [open|paid|void], subtotal_sen, service_charge_sen, sst_sen,
  rounding_sen, total_sen, created_by, created_at, paid_at, synced_at)
- `order_lines` (id, order_id, item_id, name_snapshot, unit_price_sen, qty,
  modifiers_snapshot jsonb, line_total_sen, note, status [active|void], void_reason)
- `payments` (id, order_id, method [cash|duitnow_qr], amount_sen,
  cash_received_sen, change_sen, reference, created_at)
- `shifts` (id, outlet_id, device_id, opened_by, opened_at, opening_float_sen,
  closed_by, closed_at, counted_cash_sen, expected_cash_sen, variance_sen)
- `audit_log` (id, merchant_id, staff_id, action, details jsonb, created_at)

Item names and prices are **snapshotted** on order lines so old receipts never change
when the menu changes.

This schema is identical for the Android tablet app and the web POS — same Dexie
tables locally, same Supabase tables in the cloud, same sync queue. Do not add
target-specific tables or fields; a device/outlet is a device/outlet regardless
of whether it's running inside Capacitor or a browser.

## 7. Business rules (Malaysia)

- **Order of calculation:** subtotal → service charge (if enabled) → SST (if enabled)
  → cash rounding (cash payments only) → total. Keep this in one pure,
  fully tested function `calculateTotals()`.
- **SST and service charge:** both configurable per outlet (on/off + rate).
  Defaults: SST off, service charge off. The shop owner sets them.
- **Cash rounding:** round the final cash bill to the nearest 5 sen
  (e.g. x.01–x.02 down, x.03–x.04 up). Not applied to QR payments.
- **Receipt numbers:** `<device prefix>-<YYYYMMDD>-<running no>` — generated
  locally so they stay unique offline.
- **Voids and discounts:** require manager/owner PIN and a reason; always logged
  in `audit_log`. Paid orders cannot be edited, only voided (with refund record).
- **Receipt must show:** shop name, SSM no., SST no. (if SST enabled), address,
  receipt no., date/time, cashier, items with modifiers, subtotal, service charge,
  SST, rounding, total, payment method, change.

## 8. Offline-first rules (most important)

- Every action writes to Dexie first and works with no internet.
- A sync queue pushes new/changed records to Supabase when online; retries
  with backoff; never loses data.
- Menu and settings are pulled from the cloud and cached locally.
- Show a clear online/offline indicator and "X records waiting to sync".
- Conflict rule: orders/payments are created on one device only, so the
  device's version wins. Menu/settings: cloud wins.

## 9. Payments (MVP)

- **Cash:** enter amount received, show change, open cash drawer
  (drawer kick via the receipt printer).
- **DuitNow QR (static):** show the merchant's own DuitNow QR image on screen;
  cashier confirms receipt manually and enters a reference. No money passes
  through our system. (Dynamic QR via a licensed gateway = later version.)

## 10. Build phases (one phase at a time)

### Phase 1 — Foundation

- Project setup (Vite, Tailwind, ESLint, Prettier, Vitest, Capacitor)
- Supabase schema + RLS (multi-tenant) + tests
- Owner sign-up, merchant/outlet setup, staff with PINs
- Dexie local DB + sync queue skeleton + online/offline indicator

### Phase 2 — Menu and ordering

- Owner: categories, items, modifier groups (back-office)
- POS screen: category tabs, item grid, modifiers popup, cart, notes
- Dine-in (pick table) / takeaway; hold open orders; open tables view
- `calculateTotals()` with full unit tests

### Phase 3 — Payment and printing

- Cash and DuitNow QR payment flow
- Printing behind one interface (`features/printing`) with two implementations:
  Capacitor plugin (Android) and local print-bridge agent over LAN HTTP (web)
- ESC/POS receipt + kitchen ticket printing; cash drawer kick on both targets
- Reprint receipt; void with PIN + reason

### Phase 4 — Shift and reports

- Open shift (cash float) / close shift (cash count, variance)
- Daily sales (Z) report: totals by payment method, by item, by category,
  voids, SST and service charge collected
- Owner web dashboard: sales by day, top items; export CSV

### Phase 5 — Pilot readiness

- Full offline test: create 50 orders offline, reconnect, verify sync
- Error handling, loading/empty states, large touch targets for tablet
- Onboarding wizard for a new merchant
- Production deployment

## 11. Folder structure

```
src/
  app/          routes and layouts (pos/, backoffice/)
  features/     auth, menu, ordering, payment, shift, reports, sync
    printing/    shared interface + two implementations:
                 capacitor-plugin (Android), network-bridge (web)
  components/   shared UI
  lib/          supabase client, dexie db, money utils, calculateTotals, types
supabase/
  migrations/   SQL schema + RLS policies
  functions/    edge functions
android/        Capacitor Android project
print-bridge/    local print-bridge agent (web POS printer/drawer helper)
```

## 12. Working rules to save usage

- ONE small task per request. Confirm the plan in 3–5 bullet points first.
- Do not read `node_modules`, `dist`, `android/build`, or lock files.
- Read only the files needed for the current task.
- After each task, list changed files briefly.
- If a requirement is unclear, ask instead of guessing.
