# Supabase schema & RLS

- `migrations/20260101000000_init_schema.sql` — all tables from CLAUDE.md
  section 6. Every table carries `merchant_id` directly (section 4), even
  where section 6's column list didn't spell it out, so RLS stays simple.
- `migrations/20260101000001_rls_policies.sql` — enables RLS on every table
  and adds select/insert/update/delete policies scoped to
  `is_merchant_member(merchant_id)`.
- `tests/database/rls_isolation.test.sql` — pgTAP tests proving one merchant
  cannot see or write another merchant's rows.

## Auth model

Staff log in with a PIN on an already-signed-in device (section 5) — the PIN
is a local-only UI gate and never reaches Supabase Auth or RLS. The RLS
principal is whichever Supabase Auth user is signed in: the owner's own
login on the back-office web, or a per-device login set up once when the
device is provisioned. `user_merchants` links that auth user to the
merchant(s) they belong to; `is_merchant_member()` is what every policy
checks against.

Creating a merchant (`insert into merchants`) is allowed for any
authenticated user, and a trigger (`link_owner_to_new_merchant`)
auto-grants them membership. Because that grant happens after the insert,
the app must not chain `.select()` onto `insert into merchants`: Postgres
checks the SELECT policy before the trigger runs and fails with 42501.
`createMerchantWithOutlet()` inserts first and reads the row back separately.

## Running this

The migrations and `rls_isolation.test.sql` have been run on PGlite (real
Postgres, with stubs for Supabase's `auth` schema and a small stand-in for
pgTAP), but **not yet on a real Supabase instance or with real pgTAP**. Before
trusting them with real data, run the tests against your project (see
`DEPLOYMENT.md`) or the local stack. Install the CLI as described in
`DEPLOYMENT.md`, then:

```sh
supabase init              # only if supabase/config.toml doesn't exist yet
supabase start
supabase test db           # add --linked to target the linked project instead
```

`supabase test db` runs every `*.test.sql` file under `tests/database` with
pgTAP and reports pass/fail per assertion.

## Cross-reference consistency

RLS (above) guarantees a merchant can't read/write another merchant's rows,
but it doesn't check that a row's *own* foreign keys agree with each other —
e.g. a `device`'s `outlet_id` could point at an outlet belonging to a
different merchant than the device row's own `merchant_id`. That would be a
bug, not an attack (RLS already stops the attack case), but it would
silently corrupt that row's reporting and scoping.

`migrations/20261102000000_merchant_consistency_triggers.sql` closes this
with a generic `assert_fk_merchant_matches(fk_column, ref_table)` trigger
function, attached once per foreign key that crosses into another
merchant-scoped table (devices → outlets, items → categories, orders →
outlets/devices/tables/staff, etc.). Any insert/update where the referenced
row's `merchant_id` disagrees with the new row's own `merchant_id` is
rejected. A null FK (e.g. `orders.table_id` for takeaway orders) is always
allowed through. See `tests/database/merchant_consistency.test.sql`.
