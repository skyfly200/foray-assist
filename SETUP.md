# Setup guide: what you need to do

Everything here is **optional for the app to work**. Foray Assist runs fully offline with none of it: logging finds, photos, voice notes and label printing all work with no accounts. Each section below unlocks one extra capability.

| I want… | Do section |
| :--- | :--- |
| The deployed site to load | [1. Vercel](#1-vercel) |
| Sync/backup and sign-in | [2. Supabase](#2-supabase) |
| Import from Google Photos | [3. Google Cloud](#3-google-photos-google-cloud) |
| Publish to iNaturalist | [4. iNaturalist](#4-inaturalist) |
| Install on my phone + offline voice | [5. Install on Android](#5-install-on-android) |
| Print labels | [6. Bluetooth printer](#6-bluetooth-label-printer) |

Do them in order; later sections depend on earlier ones. Menu names in dashboards change over time. If a label below doesn't match exactly, look for the closest one.

---

## 1. Vercel

You already created the project. Verify it deploys.

1. Open your project at <https://vercel.com/dashboard> → click the project → **Deployments**.
2. Open the latest deployment from `main`. It should say **Ready**. The app now loads even with no environment variables, so an older deployment that crashed with a 500 error should be fixed by the latest one.
3. Check **Settings → Build & Development** (or **Build and Deployment**): Framework Preset should be **Nuxt.js**, Build Command `npm run build` (default).
4. Open the **Build Logs** of a deployment and look at the install step. If you see an error from `onnxruntime-node` (a download failing during `npm install`), tell me and I'll fix it. It shouldn't be needed in the browser.
5. Note your production URL (for example `https://forray-assist.vercel.app`). You'll need it as `APP_ORIGIN` below.

**Adding environment variables** (used in sections 2–4): project → **Settings → Environment Variables** ([docs](https://vercel.com/docs/projects/environment-variables)). Add each one for **Production** (and Preview if you use previews). **After adding or changing any variable, you must redeploy** (Deployments → ⋯ on the latest → **Redeploy**). The site is prerendered, so public values are baked in at build time.

| Variable | Where it comes from | Used for |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Supabase (section 2) | Sync, sign-in |
| `SUPABASE_KEY` | Supabase **anon / publishable** key | Sync, sign-in (safe for the browser) |
| `SUPABASE_SERVICE_KEY` | Supabase **service_role / secret** key | Server routes only. **Keep secret.** |
| `APP_ORIGIN` | Your production URL, no trailing slash | OAuth redirects |
| `GOOGLE_CLIENT_ID` | Section 3 | Google Photos |
| `GOOGLE_CLIENT_SECRET` | Section 3 | Google Photos |
| `INAT_APP_ID` | Section 4 | iNaturalist |
| `INAT_APP_SECRET` | Section 4 | iNaturalist |

---

## 2. Supabase

### 2.1 Create a project
1. Sign in at <https://supabase.com/dashboard> and click **New project** (<https://supabase.com/dashboard/new>).
2. Pick a name, a strong database password (save it somewhere), and a region near you. Create it and wait a minute or two.

### 2.2 Get your keys
1. In the project, go to **Project Settings → API** (or **API Keys**).
2. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon / publishable key** → `SUPABASE_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_KEY`. This one bypasses all security rules, so only ever put it in Vercel's environment variables, never in code or the browser.
3. Add all three in Vercel (section 1), then redeploy.

### 2.3 Apply the database migrations
> **Warning:** `0002` **drops and recreates** the `forays` and `transcript_segments` tables from the early prototype. On a fresh project that's fine. Don't run it on a project holding data you want to keep.

1. In the Supabase dashboard open **SQL Editor** → **New query**.
2. Open each file from the repo's `supabase/migrations/` folder, **in this order**, paste it into the editor, and click **Run**:
   1. `0001_init.sql`
   2. `0002_sync_schema.sql`
   3. `0003_integrations.sql`
   4. `0004_unique_specimen_id.sql`
3. Check **Table Editor**: you should see `forays`, `specimens`, `photos`, `voice_notes`, `integration_tokens`. `integration_tokens` should show RLS enabled with no policies. That's intentional, and only the server can read it.
4. Check **Storage**: there should be a private bucket named `foray-media`.

(If you prefer the CLI: install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), run `supabase link`, then `supabase db push`.)

### 2.4 Allow sign-in links to return to your app
1. Go to **Authentication → URL Configuration**.
2. Set **Site URL** to your production URL (e.g. `https://forray-assist.vercel.app`).
3. Under **Redirect URLs** add `https://forray-assist.vercel.app/settings` (your URL + `/settings`). For local development also add `http://localhost:3000/settings`.
4. Save.

### 2.5 Sign-in emails
Sign-in uses an emailed magic link. Supabase's built-in email sender is heavily rate-limited (a few emails per hour), which is fine for one person trying things out. For regular use, set your own SMTP under **Authentication → SMTP Settings** ([docs](https://supabase.com/docs/guides/auth/auth-smtp)).

### 2.6 Test it
Open your deployed app → **Settings** → enter your email → **Send link** → open the email on the same device → you should land back on Settings showing signed in, and the sync pill should turn green after a moment. In Supabase **Table Editor → forays** you should see your forays appear.

---

## 3. Google Photos (Google Cloud)

The app uses Google's **Photos Picker API** (you choose photos in Google's own picker). Google closed the older "read my whole library by date" access to new apps, so this is the supported route. The picker doesn't return GPS data.

1. Go to <https://console.cloud.google.com/> and create a project (project dropdown → **New project**), or pick an existing one.
2. **Enable the API:** open <https://console.cloud.google.com/apis/library/photospicker.googleapis.com> and click **Enable**.
3. **OAuth consent screen:** <https://console.cloud.google.com/apis/credentials/consent> (newer consoles call this **Google Auth Platform**).
   - User type **External**, fill in app name (e.g. "Foray Assist"), your email as support and developer contact.
   - Add the scope `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`.
   - Leave the app in **Testing** and add your own Google account under **Test users**.
   - Note: while in Testing mode, Google expires sign-ins after **7 days**, so you'll need to reconnect weekly. Publishing the app removes that, but may require Google verification.
4. **Create credentials:** <https://console.cloud.google.com/apis/credentials> → **Create credentials → OAuth client ID** → application type **Web application**.
   - **Authorized redirect URIs:** add `https://YOUR-VERCEL-URL/api/google/callback`. For local development also add `http://localhost:3000/api/google/callback`.
   - Click **Create** and copy the **Client ID** and **Client secret**.
5. In Vercel add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_ORIGIN` (section 1), then redeploy.
6. Test: app → **Settings → Google Photos → Connect**. Sign in with the test account you added, allow access, and you should return to Settings showing connected. Then in a foray, switch to **Review** mode → **Pick from Google Photos**.

---

## 4. iNaturalist

1. Log in to iNaturalist, then open <https://www.inaturalist.org/oauth/applications/new>.
2. Fill in:
   - **Name:** Foray Assist
   - **Redirect URI:** `https://YOUR-VERCEL-URL/api/inat/callback` (add `http://localhost:3000/api/inat/callback` on a second line for local development)
   - Leave **Confidential** checked.
3. Save. Copy the **Application ID** → `INAT_APP_ID` and the **Secret** → `INAT_APP_SECRET`.
4. Add them in Vercel (with `APP_ORIGIN`), then redeploy.
5. Test: **Settings → iNaturalist → Connect**, approve, and you should return showing your iNaturalist username. Then in a foray's **Review** mode, pick a find and publish. Try it first with a single test observation.

Please follow iNaturalist's community guidelines and keep uploads to real observations. See their [API recommended practices](https://www.inaturalist.org/pages/api+recommended+practices).

---

## 5. Install on Android

1. Open your production URL in **Chrome** on your Android phone.
2. Chrome menu (⋮) → **Install app** (or **Add to Home screen**).
3. Open it from the home-screen icon. It runs full-screen, like a normal app.
4. **Stay on Wi-Fi for the first launch.** When the app is installed it automatically downloads the offline speech model plus the speech engine files (**about 70 MB in total**), so voice notes work with no signal. You can check progress in **Settings → Voice**. If you're on Data Saver, it will wait and you can press the download button yourself.
5. Allow **Microphone**, **Camera** and **Location** when asked. Location is used to stamp finds.
6. **Check offline works:** turn on airplane mode, open the app, log a find with a photo and a voice note.

If a voice note fails with "Could not start audio source": another app or browser tab is probably using the microphone. Close it and try again.

---

## 6. Bluetooth label printer

Printing works from **Chrome on Android only** (iPhones can't print yet, which is on the roadmap).

1. Use a Bluetooth thermal printer that speaks **ESC/POS** or **TSPL** (many generic "58 mm" and "label" printers do). Niimbot printers use their own protocol and are **not supported yet**. Printing is untested on real hardware, so please report what happens.
2. Turn the printer on. You do **not** need to pair it in Android's Bluetooth settings first.
3. Make sure Android **Bluetooth** and **Location** are on (Chrome needs both to scan).
4. In the app open a find → **Print label** → **Connect** → choose your printer from Chrome's list → choose the protocol (try **ESC/POS** first, then **TSPL**) → **Print**.
5. If the print comes out blank, garbled or inverted, tell me the printer model and which protocol you picked.

---

## Smoke-test checklist

- [ ] Deployed site loads and works in airplane mode after the first visit
- [ ] Create a foray, log a find, add a photo (camera), record a voice note
- [ ] Settings shows sync **configured** and you can sign in (needs section 2)
- [ ] Review mode: add photos, **Group into finds**, best photos are pre-selected
- [ ] Google Photos pick works (section 3)
- [ ] Publish one find to iNaturalist (section 4)
- [ ] Label prints (section 6)

## Troubleshooting

| Problem | Try |
| :--- | :--- |
| Site shows an error page | Check the Vercel deployment log; confirm the latest deployment is Ready; redeploy |
| "Cloud sync is not configured" in Settings | `SUPABASE_URL`/`SUPABASE_KEY` missing; add and **redeploy** |
| Magic link opens but you're not signed in | The redirect URL isn't allowed. Redo section 2.4 exactly (including `/settings`) |
| Google "redirect_uri_mismatch" | The redirect URI in Google Cloud must exactly match `APP_ORIGIN` + `/api/google/callback` |
| Google asks you to sign in again after a week | Normal while the app is in Testing mode (section 3) |
| iNaturalist connect fails | Redirect URI must exactly match `APP_ORIGIN` + `/api/inat/callback`; check `INAT_APP_ID` and `INAT_APP_SECRET` |
| Items stuck "waiting" to sync | Settings → Sync issues shows anything that failed permanently, with Retry/Discard |
| Voice model won't download | Needs internet once; try Wi-Fi; check Settings → Voice for the error |
