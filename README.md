# 🍄 Foray Assistant App

> **Streamlining post-foray observation management, offline field tagging, and privacy-preserving ecological data contribution.**

The **Foray Assistant App** is a specialized assistant built for mushroom foragers, field mycologists, and citizen scientists. It solves the friction of managing dozens of field photos, creating quality iNaturalist observations, and tracking physical specimens—all while preserving secret foraging locations through state-of-the-art Zero-Knowledge cryptography and local-first data principles.

---

## 🌟 Key Features (MVP)

### 📸 Spatio-Temporal Photo Clustering
* Automatically groups photo bursts from in-app capture, the device photo picker and Google Photos into individual specimen finds using EXIF timestamps and GPS proximity algorithms.
* Eliminates manual sorting after a long day in the woods.

### 🔍 Automated Blur Detection & Quality Filtering
* Runs Laplacian variance image analysis on-device (Web Worker, works offline) to evaluate image sharpness.
* Automatically ranks and selects the best 2–4 representative photos from a burst for upload, hiding blurry or out-of-focus shots.

### 🌿 Seamless iNaturalist Auto-Upload
* Integrates directly with the iNaturalist REST API via `inaturalistjs`.
* Batch-creates structured observations with taxonomic guesses, EXIF metadata, custom Observation Fields (OFVs), and configurable geoprivacy settings (`obscured` / `private`).

### 🎙️ Foray Mode: Offline Field Logger
* Fully offline-first PWA: logging, capture and printing never need a connection.
* In-app photo capture, structured field notes (substrate, host tree, odor, cap texture) and **on-device Whisper** speech-to-text for interactive voice dictation.
* Generates unique local Specimen IDs (`FORAY-YYYYMMDD-XXX`) to link digital logs with physical collections.

### 🗂️ Review Mode: After the Foray
* Import photos via the photo picker or Google Photos, cluster them into finds, curate with blur scoring, and publish to iNaturalist.

### 🏷️ Bluetooth Thermal Label Printing
* Pairs with portable ESC/POS Bluetooth thermal printers via WebBluetooth.
* Instantly prints physical specimen tags in the field with QR codes containing local specimen IDs, iNaturalist draft anchors, and metadata.

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: `v20.x` or higher
* **npm** / **pnpm**
* **Supabase project** (only needed for sync; the app works fully offline without it): apply `supabase/migrations/` in order (SQL editor or `supabase db push`). **`0002` drops the prototype `forays` and `transcript_segments` tables from `0001` and recreates them**, so don't run it against a project holding data you want to keep. Add `<your-origin>/settings` to Supabase Auth redirect URLs for magic-link sign-in.
* **iNaturalist Account & Credentials**: Required for OAuth2 / JWT authentication.

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/foray-assistant-app.git
cd foray-assistant-app

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
```

### Environment Setup (`.env`)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_or_publishable_key
INAT_APP_ID=your_inat_app_id
INAT_APP_SECRET=your_inat_app_secret
INAT_REDIRECT_URI=http://localhost:3000/auth/callback
GOOGLE_PHOTOS_CLIENT_ID=your_google_client_id
```

Server-only variables (set in Vercel too; never expose to the browser): `SUPABASE_SERVICE_KEY`, `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INAT_APP_ID`, `INAT_APP_SECRET`. See `.env.example`.
Google Photos uses the **Picker API** (the Library API time-window query is closed to new projects): enable "Google Photos Picker API" and add `<APP_ORIGIN>/api/google/callback` as a redirect URI. For iNaturalist, register an app at inaturalist.org/oauth/applications/new with redirect `<APP_ORIGIN>/api/inat/callback`.

### Development Server
```bash
npm run dev
```
The service worker is disabled in dev. To test offline behavior, run `npm run build && node tests/offline.mjs` (Playwright against the production build).
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | Nuxt 3 (Vue 3) + Vuetify 3 |
| **Backend / Database** | Supabase (Postgres, Auth, RLS) |
| **Hosting** | Vercel |
| **Local Storage** | IndexedDB / Dexie.js (source of truth, offline-first) + Supabase sync |
| **Speech-to-Text** | On-device Whisper (offline) |
| **Image Processing** | On-device Laplacian variance blur scoring (Web Worker) |
| **API Integration** | `inaturalistjs`, Google Photos REST API (via Nitro server routes) |
| **Printer Interface** | ESC/POS via WebBluetooth API |
| **Styling / Icons** | Vuetify + Material Design Icons |

### Deploy
Import the repo in Vercel (Nuxt is auto-detected) and set `SUPABASE_URL` and `SUPABASE_KEY` in the project's environment variables.

---

## 🛡️ Privacy & Cryptography (Roadmap Highlights)

While the MVP focuses on post-foray automation and physical specimen tagging, the broader roadmap incorporates advanced privacy technology:

* **Zero-Knowledge Geofencing**: Generates Circom/Noir ZK-SNARK proofs that confirm an observation occurred within a valid ecological boundary without revealing exact coordinates.
* **Private Federated Learning (zk-FL)**: Trains local species models on-device during off-peak nightly charging, sharing encrypted model updates rather than raw location data.
* **NextStrata Tokenomics & ZK Badges**: Rewards compute contributions with ZK Soulbound Badges and utility tokens to gate access to rare species micro-climate models.

*For full details on upcoming phases, see [`ROADMAP.md`](./ROADMAP.md).*
*Roadmap Phase 3 adds a voice-guided collection mode for beginners.*
*For technical MVP specifications, see [`SPEC.md`](./SPEC.md).*

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for details.
