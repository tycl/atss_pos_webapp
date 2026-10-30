# Production deployment

The POS has two parts to deploy, plus one that always runs locally and is
never deployed:

1. **Supabase project** — the cloud database/auth backend.
2. **Web app** — this React app, deployed to Vercel.
3. **print-bridge agent** — runs on a PC at each outlet's counter, not on
   the internet. See [print-bridge/README.md](./print-bridge/README.md).
   Nothing to do here for "deployment" — each outlet installs and runs it
   locally per that README.

Do these in order: a Supabase project has to exist before the web app can
be given its URL and key.

## 1. Create the Supabase project

1. Sign up / log in at [supabase.com](https://supabase.com) and create a
   new project (pick a region close to Malaysia, e.g. Singapore).
2. Install the Supabase CLI if you don't have it:
   ```sh
   npm install -g supabase
   ```
3. Link this repo to the new project (run from the repo root):
   ```sh
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
   The project ref is in the Supabase dashboard URL:
   `supabase.com/dashboard/project/<project-ref>`.
4. Push the migrations in `supabase/migrations/` to the project:
   ```sh
   supabase db push
   ```
5. **Verify RLS before trusting it with real data.** The migrations
   have not been run anywhere before this (see `supabase/README.md`'s
   "Known gap" note). Run the pgTAP isolation tests against the project:
   ```sh
   supabase test db
   ```
   Confirm every test passes — these prove one merchant can't read or
   write another merchant's rows.
6. In the dashboard, go to **Project Settings → API** and copy:
   - **Project URL** → this is `VITE_SUPABASE_URL`
   - **anon public key** → this is `VITE_SUPABASE_ANON_KEY`

   Keep these; the web app needs them in step 2.

## 2. Deploy the web app to Vercel

1. Push this repo to GitHub (if not already) and sign up / log in at
   [vercel.com](https://vercel.com) with that GitHub account.
2. **Add New → Project**, import this repository. Vercel reads
   `vercel.json` (committed in this repo) and auto-configures the build —
   you shouldn't need to change build settings.
3. Before the first deploy, add the environment variables from step 1
   under **Settings → Environment Variables** (Production scope):
   | Name                     | Value                  |
   | ------------------------ | ---------------------- |
   | `VITE_SUPABASE_URL`      | from Supabase step 1.6 |
   | `VITE_SUPABASE_ANON_KEY` | from Supabase step 1.6 |
4. Click **Deploy**. Vercel runs `npm run build` and serves `dist/`.
5. Once deployed, open the Vercel-assigned URL (or your own custom domain,
   set under **Settings → Domains**).

Every push to the connected branch redeploys automatically. For a manual
one-off deploy from your machine instead of GitHub, use the Vercel CLI:

```sh
npm install -g vercel
vercel --prod
```

## 3. Smoke test after deploying

Open the deployed URL and walk through, in order:

1. `/signup` — create the owner account (this talks to Supabase Auth).
2. `/onboarding` — the setup wizard: shop details → outlet & tax → PIN →
   review → finish. Confirm it lands on `/pos`.
3. Add a category and item in **Back office → Menu**.
4. Place an order on the POS screen, pay with cash, confirm the receipt
   screen/print flow (printing itself needs a print-bridge agent and a
   real printer — see its README — so this step can be skipped if neither
   is set up yet).
5. Open **Reports → Daily sales** and confirm the order shows up.
6. Refresh the page on a non-root route (e.g. `/pos/orders`) and confirm
   it still loads instead of 404ing — this checks the SPA rewrite in
   `vercel.json` is working.
7. Go offline (devtools → Network → Offline), place another order, go back
   online, and confirm the sync indicator drains the queue.

## Notes

- This deploys the **web POS target** only (CLAUDE.md section 2's
  "browser-based web app, no Capacitor"). The Android/Capacitor tablet
  target is out of scope for this deployment — it has its own packaging
  story if/when that target is built.
- `.env`, `.env.local`, etc. are gitignored — never commit real Supabase
  keys. `.env.example` documents the variable names; `.env.test` holds
  dummy values used only by local dev/testing against a stub backend.
- The anon key is safe to expose in the deployed JS bundle by design — RLS
  is what actually protects data, which is why step 1.5's test run matters
  before going live.
