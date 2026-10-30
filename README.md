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

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for setting up the production Supabase
project and deploying the web app to Vercel.
