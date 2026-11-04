# ATSS POS Webapp

A point-of-sale system for small F&B businesses in Malaysia, built offline-first
with React, TypeScript, Dexie (IndexedDB), and Supabase. See [CLAUDE.md](./CLAUDE.md)
for the full product spec, data model, and build phases.

## Stack

- React + TypeScript + Vite + React Router + Tailwind CSS
- Dexie (IndexedDB) for local-first offline storage
- Supabase (Postgres, Auth, RLS) for the cloud backend
- Vitest + Testing Library for tests

## Scripts

```sh
npm run dev           # start dev server
npm run build         # typecheck + production build
npm run lint          # eslint
npm run format        # prettier --write
npm run format:check  # prettier --check
npm test              # vitest run
npm run test:watch    # vitest watch mode
```

## Platform admin portal

`/platform-admin` manages the product itself, separate from the per-merchant
back-office each shop owner uses. It's for the product owner to set each
merchant's subscription plan (`basic` = device-only, never syncs to Supabase;
`standard` = syncs as normal), status, and subscription period, and to see a
dashboard of every merchant with outlet/device counts.

It's gated by a dedicated `platform_admins` table/Supabase Auth account —
never a merchant-owner login (see
`supabase/migrations/20261103000000_merchant_plan_and_platform_admin.sql` for
the schema, and `src/app/platform-admin/` for the UI). Sign in at
`/platform-admin/signin`.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for setting up the production Supabase
project and deploying the web app to Vercel.
