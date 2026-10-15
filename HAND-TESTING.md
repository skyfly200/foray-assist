# Foray Assist: hand-testing checklist

Everything here needs a real phone, a real printer or a real account, so it can't be checked from the cloud. Automated tests already cover the logic (ID codes, clustering, blur scoring, sync retry, label layout, and the ID flow on a local Supabase stack, 25 of 25 checks in draft PR #2). This list is what's left for you.

Steps refer to sections of `SETUP.md`. Last updated 2026-10-13.

## 0. Before you start (one-time setup)

- [ ] Vercel: latest `main` deployment is **Ready**, Nuxt preset, no `onnxruntime-node` install error (SETUP 1)
- [ ] Create a Supabase project for Foray Assist (your account doesn't have one yet) (SETUP 2.1–2.2)
- [ ] Add `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `APP_ORIGIN` in Vercel and redeploy
- [ ] Decide on draft PR #2 (network-number fix) before applying migrations, so `0005` goes on with the fix
- [ ] Apply migrations `0001` to `0006` in order; check the 13 tables, RLS on `integration_tokens`, and the private `foray-media` bucket (SETUP 2.3)
- [ ] Set Site URL and the `/auth/callback` redirect URL (SETUP 2.4)

## 1. Sign-in and ID v2 (real Supabase)

- [ ] Add `{{ .Token }}` to **both** the Magic Link and Confirm signup email templates (SETUP 2.5)
- [ ] First sign-in with a **new** email, using the link: you land on the Welcome screen; "Let's go" takes you home (or into your open foray)
- [ ] Sign in again (new device or after signing out) with the link: no welcome, you go straight to your open foray, or home if none
- [ ] Open a join link while signed out, tap "Sign in", use the emailed link: you come back to the join page
- [ ] An expired or already-used link shows "Couldn't sign you in" with a way to try again
- [ ] Sign in with the **6-digit code** typed into the installed app (the case where the link opens in another browser): a new account sees the welcome, an existing one stays where it is
- [ ] Onboarding card appears on first launch and the ID stock fills (about 4,096 IDs) after sign-in
- [ ] A new find gets an ID like `B7QM-4T9R-X`; the check character catches a one-letter typo in the verify box
- [ ] Log finds while signed out or offline: they show **ID pending**, then get numbered once you sign in and reconnect
- [ ] An unverified email is refused by `claim_id_sets` (try an account that never confirmed)
- [ ] **Two devices claim IDs at the same moment** (two phones, or phone and laptop, signed in as different users, tap sign-in together): no overlapping IDs
- [ ] Same user on two devices: each device gets its own sets, no duplicates after both sync
- [ ] Access rules: a second user can't see your forays, finds, photos, ID networks or sets
- [ ] Optional: run `tests/supabase-e2e.mjs` from PR #2 against the real project
- [ ] Decide: old-format IDs (`SF-M042K`) still on a device will never sync. Ignore if nobody has pre-ID-v2 finds

## 2. Offline sync

- [ ] Sync pill turns green after sign-in; forays, finds, photos and voice notes appear in Supabase (SETUP 2.7)
- [ ] Airplane mode: create a foray, log finds with photos and voice notes, edit one, then reconnect; everything uploads once with no duplicates
- [ ] Kill the app mid-upload and reopen: the queue resumes
- [ ] Force a failure (e.g. revoke the session): the item shows under **Settings → Sync issues** with Retry and Discard, and other items keep syncing
- [ ] Phone storage stays put after a few days (the app asks the browser for persistent storage)

## 3. Install and offline app (Android, Chrome)

- [ ] Install from the Chrome menu; it opens full-screen from the home-screen icon (SETUP 5)
- [ ] First launch on Wi-Fi auto-downloads the voice model (~70 MB); progress shows in **Settings → Voice**
- [ ] With Data Saver on, the auto-download waits and the manual button works
- [ ] Microphone, Camera and Location permission prompts appear and work; finds get a location stamp
- [ ] Airplane mode after the first visit: app loads and all of Foray mode works
- [ ] Optional: iPhone Safari "Add to Home Screen" (everything except printing should work)

## 4. Speech (from the "Test speech on phone" thread)

- [ ] **Web Speech** (online, no voice model yet): 15-second note, check for doubled words
- [ ] **Whisper** (after download, hint says "On-device Whisper"): 15-second note, check the transcript isn't empty
- [ ] **Whisper offline** in airplane mode
- [ ] "Could not start audio source" when another app holds the mic: closing it and retrying works
- [ ] Report phone model and browser for each step

## 5. Camera and Review mode

- [ ] In-app camera capture in Foray mode
- [ ] Review mode: add a burst from the phone's photo picker, **Group into finds** clusters it sensibly by time and place
- [ ] Best 2–4 sharp photos are pre-selected and blurry ones hidden
- [ ] Desktop layout: side navigation and two-pane foray and review screens on a laptop browser

## 6. Google Photos import

- [ ] Google Cloud project, Photos Picker API, consent screen with you as test user, OAuth client with the callback URL (SETUP 3)
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in Vercel, redeploy
- [ ] **Settings → Google Photos → Connect** returns showing connected
- [ ] Review mode → **Pick from Google Photos** imports photos with time and location intact
- [ ] Reconnect prompt after a week is expected while the app is in Testing mode

## 7. iNaturalist publishing

- [ ] Register the OAuth app with the callback URL; `INAT_APP_ID`, `INAT_APP_SECRET` in Vercel (SETUP 4)
- [ ] **Settings → iNaturalist → Connect** returns showing your username
- [ ] Publish **one** test find: photos, species guess, notes, time and location arrive correctly
- [ ] Geoprivacy: one find each as Open, Obscured and Private shows the right location on iNaturalist
- [ ] A find with **ID pending** is left out of Publish selected, with the warning shown
- [ ] Delete the test observations afterwards

## 8. Bluetooth label printing (Chrome on Android)

- [ ] Printer: an ESC/POS or TSPL Bluetooth thermal printer (Niimbot isn't supported) (SETUP 6)
- [ ] Bluetooth and Location both on; **Print label → Connect** lists the printer without pairing first
- [ ] Print with **ESC/POS**, then **TSPL** if blank
- [ ] Label reads correctly: ID, QR code scans back to the ID, text not inverted or cut off
- [ ] A find with **ID pending** shows the no-ID warning and Print stays disabled
- [ ] Printing works in airplane mode
- [ ] Report printer model and which protocol worked

## 9. Shared forays, societies and nearby sharing (Phases 12 and 13, PR #3)

Needs migration `0006` and two signed-in phones (or a phone and a laptop) on different accounts.

- [ ] Share a foray: the Share dialog shows a join code and QR; the second phone joins by scanning the QR, opening `/join/<code>`, or typing the code
- [ ] Everyone's finds: each phone sees the other's finds, and new finds appear while both have signal
- [ ] A third account that hasn't joined can't see the foray or its finds
- [ ] Comment and add an ID suggestion on the other person's find; it shows on their phone, and you can't edit their record
- [ ] Location privacy: a find set to Obscured or Private shows only a coarse location (or none) on the other phone
- [ ] Download a shared photo from a find with a hidden location: it has no GPS in its EXIF
- [ ] Owner rotates the join code and turns joining off: the old code stops working, existing members keep access
- [ ] Leave the foray: live access stops, past shared finds stay with their authors
- [ ] Sharing or joining while signed out or unverified shows "Confirm your email"
- [ ] Society: create one in the SQL Editor (SETUP 2.6), the officer sees the join code under Settings → Societies, a member joins with it
- [ ] Officer or leader gets a voucher sheet (`U`–`Z` class) and adds a voucher number to a find; run a shared foray as a society foray
- [ ] Send a single find (Send on the find card) and open it on another phone (Open a shared find): preview, approve, no duplicate, nothing overwritten
- [ ] Opening the same shared find twice doesn't create a second copy
- [ ] Nearby mode: today it only reaches other windows on the same device; check it turns on and off cleanly and doesn't drain the battery
- [ ] Not testable yet: alerts and record sync over Bluetooth between phones (needs the native Android wrapper)

## 10. Voice notes: mycology vocabulary (draft PR #4)

Speech hasn't been tried on a real phone yet, so do the basic voice items first.

- [ ] With the Whisper model downloaded, record: "Stipe white with an annulus, cap with a low umbo, spore print white, probably Amanita muscaria." Terms and the Latin name come out spelled right
- [ ] Record a few more names (Cantharellus cibarius, Laetiporus sulphureus, Hericium erinaceus) and note any that are still wrong
- [ ] Enter a species guess on a find (one not in the built-in list), then say it in a voice note on that foray: it's recognised
- [ ] Settings → Voice notes model: add a name to "Species and words to recognise", leave the page and come back (it's saved), then say it in a note
- [ ] Record about 5 seconds of silence: no prompt text (lists of species or terms) appears in the transcript
- [ ] Record a long note (over 30 seconds) and use Re-transcribe: no missing or doubled words at the 30-second mark
- [ ] Try both Tiny and Base models; report which gets the Latin names right and how slow each feels
- [ ] Without the model (Web Speech, online): "um bow" / "stype" / misspelled Latin names still get cleaned up in the saved note

## 11. Voice notes fill the field form, and printing it

- [ ] On a find, record: "Brown convex cap about 6 centimeters across, white gills, smells like anise, growing in moss under oaks." While you talk (or right after you stop), the matching fields fill in and a "Filled in from your voice" box lists them
- [ ] Type a value into a field first (e.g. Odor: mild), then say a different odor: your typed value stays
- [ ] Undo in the "Filled in from your voice" box puts the fields back the way they were
- [ ] On an older voice note, "Fill form" fills only the empty fields
- [ ] Say a few things it gets wrong and report the sentence and what landed where
- [ ] Find card → Field form → Print. The page fits one sheet (A4 or Letter), and with "fit to page" off the cm ruler measures 15 cm with a real ruler
- [ ] Print label: the label has a 0 to 3 cm scale bar at the bottom; check it measures 3 cm
- [ ] Settings → Field form: hide a field (it disappears from finds and the printout), add a field with quick picks (e.g. Taste: mild, bitter, acrid), then say "taste is bitter" in a voice note: it fills in
- [ ] Field form → Forms per page 2 and 4, This find and All finds: each layout fits the page, the cut lines are straight, and empty spots print as blank forms

## 12. Foray and Review modes, and the New find button

- [ ] The Foray / Review switch sits in the top bar on the phone; the bottom bar has New find in the middle
- [ ] From the home screen with no foray in progress, tap New find and take a photo: a foray for today starts and the find is in it
- [ ] With a foray in progress, tap New find from Settings or the Dex: the find lands in that foray and the app opens it
- [ ] On a foray, tap New find: the find lands in the foray you're looking at, even an ended one
- [ ] Foray mode on a find: Take photo, voice note, the form, Print label, Send, Delete. No privacy, voucher, comments or Field form
- [ ] Review mode on a foray: "Identify & edit" shows each find with the form, privacy, voucher and comments, saved voice notes (no record button), Field form, Print label. "Sort photos" is the old photo grouping screen
- [ ] The mode you pick is remembered after closing and reopening the app

## 13. Browser speech option and Whisper retranscribe

- [ ] Settings → Voice → Speech recognition → Browser speech recognition. Record a note on a find: words appear as you speak and the field form still fills in
- [ ] The saved note has an audio player and a "Retranscribe with Whisper" button (needs the Whisper model downloaded). Tap it: the transcript is replaced and any new details fill empty fields
- [ ] If the Settings text says this browser can't keep the audio, recording still works, just with no audio on the note. Report phone and Chrome version
- [ ] Airplane mode with Browser speech chosen: the recorder uses Whisper (if downloaded)
- [ ] Switch back to On-device Whisper: notes use Whisper again

## 13. Map tab, and leaving a foray

- [ ] The bottom bar reads Forays, MycoDex, New find, Map, Settings, and fits without labels clipping
- [ ] Map shows a pin for each find that has a location; tapping one shows its name, ID, date and foray, and Open foray goes there
- [ ] The foray picker narrows the pins; the frame button fits them all; the target button shows where you are
- [ ] Look at the map with signal, then turn on airplane mode and reopen it: the area you viewed still draws
- [ ] Open a foray, then tap MycoDex, Map or Settings: the page shows (it used to come up blank)
