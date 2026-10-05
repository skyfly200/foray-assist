# 🍄 Foray Assistant App

> **Streamlining post-foray observation management, offline field tagging, and privacy-preserving ecological data contribution.**

The **Foray Assistant App** is a specialized assistant built for mushroom foragers, field mycologists, and citizen scientists. It solves the friction of managing dozens of field photos, creating quality iNaturalist observations, and tracking physical specimens—all while preserving secret foraging locations through state-of-the-art Zero-Knowledge cryptography and local-first data principles.

---

## 🌟 Key Features (MVP)

### 📸 Spatio-Temporal Photo Clustering
* Automatically groups photo bursts from Google Photos / local camera rolls into individual specimen finds using EXIF timestamps and GPS proximity algorithms.
* Eliminates manual sorting after a long day in the woods.

### 🔍 Automated Blur Detection & Quality Filtering
* Employs Laplacian variance image analysis (via `sharp` / `blurry-detector`) to evaluate image sharpness.
* Automatically ranks and selects the best 2–4 representative photos from a burst for upload, hiding blurry or out-of-focus shots.

### 🌿 Seamless iNaturalist Auto-Upload
* Integrates directly with the iNaturalist REST API via `inaturalistjs`.
* Batch-creates structured observations with taxonomic guesses, EXIF metadata, custom Observation Fields (OFVs), and configurable geoprivacy settings (`obscured` / `private`).

### 🎙️ Live Assistant & Offline Field Logger
* Local-first mobile workflow operating entirely offline without cellular connectivity.
* Supports quick voice dictation and structured field notes (substrate, host tree, odor, cap texture).
* Generates unique local Specimen UUIDs (`CO-YYYYMMDD-XXXX`) to link digital logs with physical collections.

### 🏷️ Bluetooth Thermal Label Printing
* Pairs with portable ESC/POS Bluetooth thermal printers via WebBluetooth.
* Instantly prints physical specimen tags in the field with QR codes containing local specimen IDs, iNaturalist draft anchors, and metadata.

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: `v18.x` or higher
* **npm** / **pnpm**
* **Supabase project**: Apply `supabase/migrations/0001_init.sql` (SQL editor or `supabase db push`).
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

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | Nuxt 3 (Vue 3) + Vuetify 3 |
| **Backend / Database** | Supabase (Postgres, Auth, RLS) |
| **Hosting** | Vercel |
| **Local Storage** | IndexedDB / Dexie.js (Offline-first architecture) |
| **Image Processing** | Sharp, Laplacian Variance filter (`blurry-detector`) |
| **API Integration** | `inaturalistjs`, Google Photos REST API |
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
*For technical MVP specifications, see [`SPEC.md`](./SPEC.md).*

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for details.
