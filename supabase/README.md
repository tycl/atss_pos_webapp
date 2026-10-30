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
auto-grants them membership — this is the sign-up path from Phase 1's
"owner sign-up" task, not yet wired to any UI.

## Running this locally

These files have **not** been executed anywhere — the environment this was
written in had no Supabase CLI, Docker, or `psql`. Before trusting this
migration, run it against the local stack:

```sh
npm install -g supabase   # or your preferred install method
supabase init              # only if supabase/config.toml doesn't exist yet
supabase start
supabase test db
```

`supabase test db` runs every `*.test.sql` file under `tests/database` with
pgTAP and reports pass/fail per assertion.

## Known gap

RLS guarantees a merchant can't read/write another merchant's rows, but
there's no trigger yet enforcing that e.g. a `device`'s `outlet_id` actually
belongs to the same `merchant_id` as the device row itself — a buggy (not
malicious) write could create a row whose `merchant_id` and `outlet_id`
disagree. Worth adding a consistency trigger before Phase 2 if this matters.
