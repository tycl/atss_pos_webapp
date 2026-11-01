# Production deployment

The POS has two parts to deploy, plus one that always runs locally and is
never deployed:

1. **Supabase project** — the cloud database/auth backend.
2. **Web app** — this React app, deployed to Google Cloud Run.
3. **print-bridge agent** — runs on a PC at each outlet's counter, not on
   the internet. See [print-bridge/README.md](./print-bridge/README.md).
   Nothing to do here for "deployment" — each outlet installs and runs it
   locally per that README.

Do these in order: a Supabase project has to exist before the web app can
be built with its URL and key.

## 1. Create the Supabase project

1. Sign up / log in at [supabase.com](https://supabase.com) and create a
   new project in the Singapore region. Save the database password. Free
   projects can pause when inactive, so use a paid plan for a live shop.
2. Install the Supabase CLI with [Scoop](https://scoop.sh) on Windows, and
   Docker Desktop, which `supabase test db` needs. A global npm install is
   not a documented install method.
   ```sh
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   ```
3. Link this repo to the new project (run from the repo root):
   ```sh
   supabase init
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
   The project ref is in the Supabase dashboard URL:
   `supabase.com/dashboard/project/<project-ref>`. `supabase init` is only
   needed once; it creates `supabase/config.toml`, which should be committed.
4. Push the migrations in `supabase/migrations/` to the project:
   ```sh
   supabase db push
   ```
5. **Verify RLS before trusting it with real data.** In the dashboard, enable
   the `pgtap` extension under **Database → Extensions**, then run the
   isolation tests against the project. Without `--linked` the command targets
   the local stack instead.
   ```sh
   supabase test db --linked
   ```
   Confirm every test passes — these prove one merchant can't read or
   write another merchant's rows. The tests roll back, so they leave no data.
6. In the dashboard, go to **Settings → API Keys** and copy:
   - **Project URL** → this is `VITE_SUPABASE_URL`
   - **Publishable key** (`sb_publishable_...`) → this is
     `VITE_SUPABASE_ANON_KEY`. The variable keeps its older name, but use the
     publishable key: the legacy anon key is being deprecated. Never use a
     secret or `service_role` key here.
7. Go to **Authentication → Sign In / Providers → Email** and turn off
   **Confirm email**. Sign-up goes straight to onboarding, which needs a
   logged-in session, and there is no "check your email" screen yet.

## 2. Deploy the web app to Google Cloud Run

`VITE_*` values are compiled into the JavaScript at build time, so they are
passed to the image build by `cloudbuild.yaml`. Setting them as Cloud Run
environment variables has no effect. To change them, rebuild the image.

1. Create a project in the [Cloud Console](https://console.cloud.google.com)
   and attach a billing account.
2. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install) if you
   don't have it, then select the project and enable the services:
   ```sh
   gcloud auth login
   gcloud config set project <your-project-id>
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```
3. Create the image repository (once only):
   ```sh
   gcloud artifacts repositories create pos --repository-format=docker --location=asia-southeast1
   ```
4. Build the image, using the values from step 1.6:
   ```sh
   gcloud builds submit --config cloudbuild.yaml --substitutions=_IMAGE=asia-southeast1-docker.pkg.dev/<your-project-id>/pos/atss-pos:v1,_SUPABASE_URL=https://<your-project-ref>.supabase.co,_SUPABASE_KEY=<your-publishable-key>
   ```
   If this fails with a permission error, give the build service account named
   in the error the **Artifact Registry Writer** and **Logs Writer** roles.
5. Deploy it. The command prints the service's HTTPS URL when it finishes.
   ```sh
   gcloud run deploy atss-pos --image asia-southeast1-docker.pkg.dev/<your-project-id>/pos/atss-pos:v1 --region asia-southeast1 --allow-unauthenticated --port 8080 --memory 256Mi --max-instances 3
   ```
6. Back in Supabase, go to **Authentication → URL Configuration**. Set **Site
   URL** to the Cloud Run URL and add `https://<your-url>/**` under **Redirect
   URLs**.

To release an update, repeat steps 4 and 5 with a new image tag such as `:v2`.
For database changes, add a migration and run `supabase db push`.

For a custom domain, Google recommends a global external Application Load
Balancer or Firebase Hosting. Cloud Run's own domain mappings work in
`asia-southeast1` but are in preview and not recommended for production. If you
add a domain, repeat step 6 with it.

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
   it still loads instead of 404ing — this checks the SPA fallback in
   `nginx.conf` is working.
7. Go offline (devtools → Network → Offline), place another order, go back
   online, and confirm the sync indicator drains the queue.

## Known limitations

- **Refreshing while offline fails.** There is no service worker, so the app
  can't load from Cloud Run without internet. A tab that is already open keeps
  working offline, but don't refresh it or restart the browser during an outage.
- **Printing needs the print-bridge on the same PC as the browser.** Use
  `http://localhost:7777` as the bridge URL. An HTTPS page generally can't call
  `http://<LAN-IP>:7777`, because browsers block it as mixed content. If Chrome
  asks for local network access, allow it.

## Notes

- This deploys the **web POS target** only (CLAUDE.md section 2's
  "browser-based web app, no Capacitor"). The Android/Capacitor tablet
  target is out of scope for this deployment — it has its own packaging
  story if/when that target is built.
- `.env`, `.env.local`, etc. are gitignored — never commit real Supabase
  keys. `.env.example` documents the variable names; `.env.test` holds
  dummy values used only by local dev/testing against a stub backend.
- The publishable key is safe to expose in the deployed JS bundle by design —
  RLS is what actually protects data, which is why step 1.5's test run matters
  before going live.
- `vercel.json` is left in the repo in case you ever host on Vercel instead. Cloud
  Run doesn't use it.
