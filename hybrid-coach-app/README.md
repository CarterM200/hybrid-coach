# Hybrid Coach — multi-user web app

Your single-file coaching app, wired up so anyone can sign up, sign in, and have
their own private training data. Stack:

- **React + Vite** (the app) — deploys as a static site
- **Supabase** — handles sign-in (email + Google) and stores each user's data
- **Vercel** (or Netlify) — hosts the site for free with HTTPS + a custom domain

Each signed-in user's entire app state is saved as one JSON row in the
`athlete_state` table, protected by row-level security so users only ever see
their own data.

---

## What's in here

```
hybrid-coach-app/
├─ index.html
├─ package.json
├─ vite.config.js
├─ .env.example            <- copy to .env and fill in 2 values
├─ supabase/schema.sql     <- run once in Supabase
└─ src/
   ├─ main.jsx             <- entry point
   ├─ AuthGate.jsx         <- sign-in / sign-up screen + session handling
   ├─ supabaseClient.js    <- connects to your Supabase project
   ├─ storage.js           <- saves/loads each user's data (debounced)
   └─ HybridCoach.jsx      <- your app (unchanged logic; storage is injected)
```

---

## Step 1 — Install the tools (one time)

1. Install **Node.js 18+** from https://nodejs.org (LTS).
2. Open a terminal in this `hybrid-coach-app` folder.
3. Run:
   ```bash
   npm install
   ```

## Step 2 — Create a Supabase project (free)

1. Go to https://supabase.com → **Sign in** → **New project**.
2. Pick a name, a strong database password, and a region near your users. Wait ~2 min for it to provision.
3. In the project, open **Project Settings → API**. Copy two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

## Step 3 — Add the database table

1. In Supabase, open **SQL Editor → New query**.
2. Open `supabase/schema.sql` from this project, copy everything, paste it in, and click **Run**.
3. You should see "Success". This creates the `athlete_state` table with row-level security.

## Step 4 — Turn on sign-in methods

1. In Supabase, open **Authentication → Providers**.
2. **Email** is on by default. For the smoothest start, open **Email** and turn **"Confirm email" OFF** while testing (turn it back on before launch).
3. (Optional) **Google sign-in:**
   - In **Authentication → Providers → Google**, toggle it on.
   - You'll need a Google OAuth client ID + secret from https://console.cloud.google.com (APIs & Services → Credentials → Create OAuth client ID → Web application). Paste them into Supabase.
   - In the Google console, add this **Authorized redirect URI** (Supabase shows the exact one to use): `https://YOUR-PROJECT-ref.supabase.co/auth/v1/callback`.
   - If you don't want Google yet, just skip this — email/password works on its own.
4. In **Authentication → URL Configuration**, set **Site URL** to `http://localhost:5173` for now (you'll change it to your real domain after deploying).

## Step 5 — Connect the app to Supabase

1. In this folder, copy `.env.example` to a new file named `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and paste the two values from Step 2:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

## Step 6 — Run it locally

```bash
npm run dev
```

Open the printed URL (usually http://localhost:5173). Create an account, and you'll
land in the app. Anything you change is saved to your Supabase row — sign out, sign
back in, and it's still there. Create a second account in an incognito window to
confirm each user has separate data.

## Step 7 — Put it online (Vercel)

1. Push this folder to a **GitHub** repo (create one at github.com, then):
   ```bash
   git init
   git add .
   git commit -m "Hybrid Coach"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/hybrid-coach.git
   git push -u origin main
   ```
   (The `.gitignore` already keeps `.env` and `node_modules` out of the repo.)
2. Go to https://vercel.com → **Sign in with GitHub** → **Add New → Project** → import your repo.
3. Vercel auto-detects Vite. Before deploying, open **Environment Variables** and add the same two:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. In ~1 minute you'll get a live URL like `https://hybrid-coach.vercel.app`.

## Step 8 — Point Supabase at your live URL

1. Back in Supabase → **Authentication → URL Configuration**:
   - Set **Site URL** to your Vercel URL (e.g. `https://hybrid-coach.vercel.app`).
   - Add the same URL under **Redirect URLs**.
2. If you enabled Google, also add your Vercel URL to the Google OAuth client's authorized origins/redirects.
3. (Optional) Add a custom domain in Vercel → **Settings → Domains**, then update the Supabase Site URL to match.

**That's it — it's public.** Anyone can visit the URL, sign up, and use their own coach.

---

## Account management (built in)

- **Forgot password** — the sign-in screen has a "Forgot password?" link that emails a reset link. Clicking it returns the user to the app, where they set a new password. (Make sure your live URL is in Supabase → Authentication → URL Configuration, Step 8.)
- **Change password** — Profile tab → Account → "Change password" (for already-signed-in users).
- **Delete account & all data** — Profile tab → Account → "Delete account & all data". This calls the `delete_user()` function from `schema.sql`, which removes the user from `auth.users`; their `athlete_state` row is deleted automatically by the cascade. It double-confirms first and is irreversible.

> The delete button needs the `delete_user()` function, which is included in `supabase/schema.sql` — so just run that file (Step 3) and deletion works with no extra backend.

## Going to production — a short checklist

- **Turn email confirmation back ON** (Supabase → Authentication → Providers → Email) so people verify real addresses.
- **Add a privacy policy.** This app stores health-adjacent data (weight, body fat, training). Tell users what you store and let them delete their account/data.
- **It is not medical advice.** Add a visible disclaimer; don't market it for diagnosing or treating anything.
- **Back up:** Supabase → Database → Backups (paid tiers add automated backups).
- **Free-tier limits:** Supabase free tier is generous for getting started; watch the dashboard usage as you grow.

## How saving works (so you can extend it)

The app keeps all state in one object called `core` and renders everything from a
pure `deriveState(core)`. `src/storage.js` saves that whole object to the user's
row as JSON (debounced ~0.8s so fast edits don't spam the database) and mirrors it
to `localStorage` for instant reloads. If you later want per-row analytics (e.g. a
table of individual runs), you can add tables and write to them from the reducer —
but the single-blob approach is the simplest way to be live today.

## Common issues

- **"Missing Supabase env vars" in the console** → you didn't create `.env` (Step 5), or on Vercel you didn't add the env vars (Step 7.3). Env vars must start with `VITE_`.
- **Sign-in does nothing / redirect error with Google** → the Site URL / Redirect URLs in Supabase (Step 8) don't match where the app is actually running.
- **Data doesn't persist** → make sure you ran `supabase/schema.sql` (Step 3) and that RLS policies were created.

- 
