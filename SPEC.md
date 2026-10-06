# Foray Assistant App — MVP Technical Specification (SPEC.md)

## 1. Overview & Objectives

The **Foray Assistant App** removes the friction of foray data capture and post-foray processing so mushroom foragers can stay focused in the field. It is a **fully offline-first** PWA: every field workflow works with no connectivity, and anything that needs the network is queued and synced later.

The app has two modes (see §2):
* **Foray Mode** — in the field: capture photos, dictate notes by voice, log finds, print specimen tags.
* **Review Mode** — after the foray: import photos, cluster and curate them, and publish to iNaturalist.

---

## 2. Modes

### 2.1 Foray Mode (during a foray)
Optimized for one-handed, glanceable, offline use under canopy.
* **In-app photo capture** (camera), each photo stamped with time and GPS and attached to the current find.
* **Voice notes** via on-device Whisper, with live interactive transcription.
* **Structured attribute form**: quick toggles for substrate, host tree, odor, cap texture, staining.
* **Find management**: start a new find, get a Specimen ID, add photos/notes/attributes, print a tag.
* No network-dependent step is required to log or print a find.

### 2.2 Review Mode (after a foray)
Optimized for a larger screen and connectivity.
* **Photo sources**: photos captured in-app, plus a **photo picker** (device camera roll / file picker) and Google Photos import for photos taken outside the app.
* **Clustering** of imported photos into finds, merged with finds already logged in Foray Mode.
* **Quality selection** with on-device blur scoring and 1-click approval/override.
* **Edit** notes, attributes and species guesses; **publish** to iNaturalist; reprint labels.

---

## 3. Core Feature Specifications

### 3.1 Photo Capture & Ingestion
* **In-app capture**: camera via `getUserMedia`/file input capture; stores originals locally with EXIF-equivalent metadata (timestamp, GPS from Geolocation API) since browser capture does not guarantee EXIF.
* **Photo picker**: multi-select from the device; reads EXIF (timestamp, GPS) where present.
* **Google Photos import** (needs connectivity): OAuth 2.0 with the **Photos Picker API** — the user picks photos in Google's own picker and the app downloads them via server routes. (Google closed the older Library API time-window query to new projects, so there is no automatic time/GPS filtering; the Picker returns no GPS, so picked photos are clustered by time and, if present, EXIF read from the downloaded file.)
* **Series clustering**: group photos into one find when Δt ≤ 120 s and Δd ≤ 5 m. Photos captured in-app against an active find are already assigned and are not re-clustered unless the user moves them.

### 3.2 Quality Selection (on-device)
* **Blur scoring runs on the device**: Laplacian variance of the grayscale image computed client-side (Canvas / WASM, in a Web Worker so the UI stays responsive). Works fully offline.
* Images are downscaled to a fixed working size before scoring for speed and comparable scores.
* Top 2–4 sharpest photos per find are flagged; the user can approve or override.
* Server-side scoring for larger/faster batches is a later roadmap item (Phase 8), not part of the MVP.

### 3.3 Voice Notes (offline Whisper, Web Speech fallback)
* **Mode selection** when Record is pressed: (1) **Whisper** if the model is cached; (2) **Web Speech API** (online) if Whisper isn't usable, labelled "Using online speech recognition — download the voice model for offline use"; (3) **raw audio only** (transcribe later) if neither is available. Web Speech and microphone capture never run simultaneously (Android gives the mic to one consumer).
* **Only one capture at a time** app-wide; the mic is released on tab hide/page hide. Mic errors are mapped to clear messages (permission, no mic, "another app or tab is using the microphone").
* **Auto-download on install**: when the app is installed (`appinstalled`, or first launch in standalone mode) and online and not on Data Saver, the default model and the self-hosted WASM runtime (`/ort/`) download automatically; a manual button remains.
* **On-device Whisper** via Transformers.js (or whisper.cpp WASM), WebGPU when available, for interactive speech-to-text with no network.
* **Two model options**: `tiny.en` (~40 MB quantized) is the default and `base.en` (~80 MB) is an opt-in "high accuracy" download in settings. The self-hosted ONNX/WASM speech engine adds ~27 MB (up to ~40 MB), so the first download is **about 70 MB** for the default. Sizes are approximate.
* Raw audio is retained so a find can be re-transcribed with the better model in Review Mode.
* Model files are downloaded once and cached via the service worker; the app must tell the user when the model is not yet cached and cannot be fetched.
* Transcription is chunked/streamed so text appears while speaking.
* Raw audio is kept locally with the transcript so it can be re-transcribed with a better model later.
* Transcripts attach to the current find as `rawVoiceTranscript` and as timestamped segments.

### 3.4 Specimen IDs
* Format: `PREFIX-YYYYMMDD-DEVICE-SEQUENCE`, e.g. `FORAY-20261005-K7-001`.
* Generated locally with no server round-trip. The sequence is per device per day, assigned in a local transaction; a short random per-device tag (`K7`) keeps IDs unique across the user's devices.
* Links notes, attributes, photos, printed tags and the eventual iNaturalist Observation ID into one record.

### 3.5 Label Printing
* Portable thermal printers that speak ESC/POS or TSPL (generic label printers; Phomemo/Brother/Zebra-class where they expose those protocols) via WebBluetooth. **Niimbot** printers use a proprietary protocol and are not supported yet.
* 50 mm × 30 mm tag: ID, species guess, date/time, obscured location, substrate, short notes, QR code.
* QR encodes the local record URI (`foray://specimen/<ID>`) or, once published, the iNaturalist observation URL.
* **Platform**: MVP printing is supported on Android/Chromium only. WebBluetooth is unavailable in iOS Safari; iOS support (native wrapper or a BLE-capable iOS browser app) is a roadmap item (Phase 9). On unsupported platforms the print button is hidden/disabled with an explanation.

### 3.6 iNaturalist Publishing (needs connectivity)
* Plain `fetch` (no `inaturalistjs`) with OAuth/JWT against **iNaturalist API v1**, isolated in one small module (`server/utils/inat.ts`) so a later move to v2 is contained. Verify any v1 deprecation date before relying on it long-term.
* Maps timestamp, coordinates, `geoprivacy` (`open` / `obscured` / `private`), species guess / `taxon_id`, field notes as description, and selected photos.
* Publishing is queued when offline and runs when connectivity returns; the user sees per-find status (draft, queued, published, failed).

---

## 4. Architecture

### 4.1 Offline-first principles
1. **Local database is the source of truth.** All reads/writes go to IndexedDB (Dexie). Supabase is a sync target and backup, never required for a field workflow.
2. **PWA**: Nuxt PWA module + service worker caches the app shell, Whisper model files and static assets so the app loads and works with no signal.
3. **Outbox queue**: network actions (sync, Google Photos import, iNat publish) are queued locally and retried with backoff.
4. **Explicit offline UX**: connectivity state is always visible; actions that need the network are disabled or queued with a clear message.

### 4.2 Stack
| Layer | Technology |
| :--- | :--- |
| Frontend | Nuxt 3 (Vue 3) + Vuetify 3, PWA |
| Local storage | IndexedDB via Dexie.js |
| STT | On-device Whisper (Transformers.js / whisper.cpp WASM) |
| Image scoring | Client-side Laplacian variance in a Web Worker |
| Backend / sync | Supabase (Postgres, Auth, Storage, RLS) |
| Server logic | Nuxt/Nitro server routes on Vercel (OAuth token exchange, iNat proxy only; no heavy image work) |
| Hosting | Vercel |
| Printing | WebBluetooth (ESC/POS / TSPL) |

### 4.3 Sync
* **Single-user app**: one account owns all data, so there are no shared forays or multi-user conflict rules. Records carry `updatedAt` and a client-generated UUID; last-write-wins covers the multi-device case (one user, e.g. phone + laptop).
* Audio and photo blobs upload to Supabase Storage after sync of their metadata; uploads are resumable and queued.
* Third-party tokens (Google, iNaturalist) are stored per user in Supabase behind row-level security.

### 4.4 Component diagram
```
+---------------------------- PWA CLIENT (offline-capable) ----------------------------+
|  Foray Mode                                  Review Mode                              |
|  camera | Whisper STT | attribute form       photo picker | Google Photos import       |
|  find mgmt | label print                     clustering | blur scoring (Web Worker)   |
|                         \                        /                                    |
|                      +-----------------------------------+                            |
|                      |  IndexedDB / Dexie  (source of    |                            |
|                      |  truth) + outbox queue            |                            |
|                      +----------------+------------------+                            |
+---------------------------------------|-----------------------------------------------+
                                        | when online
              +-------------------------+--------------------------+
              v                         v                          v
      Supabase (sync, Storage)   Nitro routes on Vercel     Thermal printer
                                 -> Google Photos / iNat    (WebBluetooth, local)
```

### 4.5 Core data model
```typescript
interface Foray {
  id: string;                  // uuid
  name: string;
  startedAt: string;           // ISO 8601
  endedAt?: string;
  mode: "foray" | "review";
}

interface SpecimenRecord {
  id: string;                  // "FORAY-20261005-K7-001"
  forayId: string;
  timestamp: string;           // ISO 8601
  latitude?: number;
  longitude?: number;
  geoprivacy: "open" | "obscured" | "private";
  fieldNotes: {
    speciesGuess?: string;
    substrate?: string;
    hostTree?: string;
    odor?: string;
    staining?: string;
    rawVoiceTranscript?: string;
  };
  voiceNotes: { id: string; audioPath: string; transcript: string; model: string; at: string }[];
  photos: {
    photoId: string;
    source: "capture" | "picker" | "google-photos";
    localBlobKey?: string;
    googlePhotosUrl?: string;
    capturedAt: string;
    latitude?: number;
    longitude?: number;
    blurScore?: number;
    isSelected: boolean;
  }[];
  iNatObservationId?: number;
  printedLabelAt?: string;
  updatedAt: string;
  syncedAt?: string;
}
```

---

## 5. MVP Milestones

1. **M1 — Offline foundation & Foray Mode core** (weeks 1–2): PWA + Dexie, find/ID generation, attribute form, in-app capture, mode switcher, outbox + Supabase sync skeleton.
2. **M2 — Whisper voice notes & label printing** (weeks 3–4): on-device Whisper with model caching, interactive transcription, WebBluetooth label layout and print.
3. **M3 — Review Mode** (weeks 5–6): photo picker + Google Photos import, clustering, on-device blur scoring, selection UI.
4. **M4 — iNaturalist publishing & end-to-end** (weeks 7–8): iNaturalist (API v1) publish queue, metadata mapping, end-to-end test: capture → voice note → print → review → publish.

---

## 5a. Implementation status
**Sync resilience:** permanent sync failures (RLS, schema, 4xx) back off and, after 5 attempts, are *parked* so they no longer block other items; transient failures (network, 5xx) pause the drain. Parked items are listed in Settings with Retry/Discard. **UI direction:** a camera-first, playful design in the spirit of the Seek app (green palette, rounded cards, bottom navigation, micro-animations; light/dark; reduced-motion respected).

M1–M4 are implemented but only partly verified: the offline flow, blur scoring and clustering run in a real browser against the production build (`tests/offline.mjs`), and pure logic has unit tests (`tests/*.test.mjs`). **Not yet verified:** on-device Whisper model download and transcription, Bluetooth printing on real hardware, Google Photos Picker and iNaturalist against live APIs, sync against a real Supabase project. Known deviations: the Google Photos Picker API replaces the time-window Library query (closed to new projects) and returns no GPS; Niimbot printers need a proprietary protocol and are unsupported.

## 6. Out of scope for MVP
Voice-guided collection (Roadmap Phase 3), advanced vision, ZK/federated learning, tokens, GBIF export, and server-side image processing (Phase 8).

---

## 7. Open Questions
_None outstanding. Decisions made: single-user; Android-only printing for MVP; iNaturalist API v1 behind a thin wrapper (revisit v2 before M4); Whisper `tiny.en` default with opt-in `base.en` download._
