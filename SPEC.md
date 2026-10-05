# Foray Assistant App — MVP Technical Specification (SPEC.md)

## 1. Executive Overview & Objectives

The **Foray Assistant App** is designed to eliminate the friction of post-foray data processing so mushroom foragers can stay focused in the field. During a foray, foragers often take dozens of photos per specimen across multiple finds, which leads to time-consuming manual sorting, geotag filtering, photo curation, and posting to iNaturalist later.

The MVP solves this by focusing on three core workflows:
1. **Google Photos Integration & Automated iNat Uploads**: Ingesting foray photos via Google Photos API, clustering photo series by timestamp/geotag, selecting top-quality images per find, and posting directly to iNaturalist.
2. **Live Field Assistant**: Lightweight, offline-first voice/text field notes logging with auto-generated Specimen UUIDs.
3. **Specimen Label Printing**: Generating and printing physical collection tags for field specimens via Bluetooth/USB thermal label printers.

---

## 2. Core Feature Specifications

### 2.1 Google Photos Integration & iNat Auto-Uploads

#### A. Photo Ingestion & Clustering
* **Google Photos API Sync**: Authenticate via OAuth 2.0 (`https://www.googleapis.com/auth/photoslibrary.readonly`) to query media items taken within a specified foray time window (e.g., 2026-10-05 10:00 to 14:00).
* **Geofence & Timestamp Filtering**: Filter photos based on EXIF GPS coordinates matching the target foray boundary.
* **Series Clustering Algorithm**:
  * Group photos into discrete "Specimen Series" based on spatio-temporal proximity thresholds ($\Delta t \le 120\text{s}$ and $\Delta d \le 5\text{m}$).
  * Each cluster represents a single fungal organism/find.

#### B. Quality Selection Engine (Blur & Sharpness Detection)
* **Laplacian Variance Filter**: Process image buffers using `sharp` or `blurry-detector` in Node.js.
* **Scoring Heuristic**:
  $$\text{Score} = \text{Var}(\Delta I_{\text{gray}})$$
  Photos with higher variance indicate sharp edges and key diagnostic details (gills, stipe, pores, cap surface).
* **Selection Interface**: Automatically flag the top 2–4 clearest photos per cluster, allowing 1-click user approval/override before uploading.

#### C. iNaturalist Publishing Pipeline
* **API Integration**: Use `inaturalistjs` with JWT token authentication.
* **Metadata Mapping**:
  * `observed_on_string`: EXIF timestamp.
  * `latitude`, `longitude`: EXIF GPS coordinates (with `geoprivacy` toggle: `open`, `obscured`, or `private`).
  * `species_guess` / `taxon_id`: Optional suggestion input from user or iNat Computer Vision endpoint.
  * `description`: Concatenated field notes from the Live Field Assistant.
  * `photos`: Direct binary attachment upload via `/v1/observation_photos`.

---

### 2.2 Live Field Assistant (Field Notes & Logging)

#### A. Offline-First Field Logging
* **Storage Engine**: Local SQLite or IndexedDB database operating 100% offline under canopy cover.
* **Capture Modes**:
  * **Quick Voice Notes**: Audio recording converted via Web Speech API / local Whisper model or cached for post-foray transcription.
  * **Structured Attribute Form**: Rapid toggles for substrate (e.g., *decaying conifer*, *soil*, *hardwood log*), host trees (*Douglas fir*, *Oak*), odor, cap texture, and staining reactions.

#### B. Specimen UUID Generation
* Each logged find receives a unique, human-readable Specimen ID:
  $$\text{Specimen ID} = \text{PREFIX}-\text{YYYYMMDD}-\text{SEQUENCE}$$
  *(e.g., `FORAY-20261005-001`)*
* Links local audio notes, attributes, physical specimen tags, and future iNaturalist Observation IDs into a single unified record.

---

### 2.3 Specimen Label Printing

#### A. Hardware Compatibility
* Supports portable thermal label printers (Niimbot, Phomemo, Brother, Zebra) using WebBluetooth, ESC/POS, or TSPL command sets.

#### B. Label Format & Layout (50mm x 30mm Standard Thermal Tag)
```
+--------------------------------------------------+
| FORAY ASSISTANT SPECIMEN TAG                    |
| ID: FORAY-20261005-001                           |
|--------------------------------------------------|
| Species: Amanita augusta (Guess)                 |
| Date: 2026-10-05 11:24 PST                       |
| Loc: Cascade Foothills (Obscured: 47.5°N, -121.8°W)|
| Substrate: Decaying Conifer / Moss               |
|                                 +--------------+ |
| Notes: Yellow veil remnants,    |  [ QR CODE ] | |
| strong anise odor.              |  Local UUID  | |
|                                 +--------------+ |
+--------------------------------------------------+
```

#### C. QR Code Mapping
* QR code encodes either:
  * Local record URI (`foray://specimen/FORAY-20261005-001`) for field identification.
  * iNaturalist Observation URL once published (`https://www.inaturalist.org/observations/{id}`).

---

## 3. System Architecture & Data Schema

### 3.1 Component Architecture

```
+-------------------------------------------------------------------+
|                        MOBILE / PWA CLIENT                        |
|                                                                   |
| +---------------------+   +------------------+   +--------------+ |
| | Live Assistant      |   | Google Photos    |   | Quality      | |
| | (Voice/Text Logger) |   | Ingestion Engine |   | Selection    | |
| +----------+----------+   +--------+---------+   +------+-------+ |
|            |                       |                    |         |
|            v                       v                    v         |
| +---------------------------------------------------------------+ |
| |               Local Database (SQLite / IndexedDB)              | |
| +----------------------------------+----------------------------+ |
|                                    |                              |
+------------------------------------|------------------------------+
                                     |
               +---------------------+---------------------+
               |                                           |
               v                                           v
+------------------------------+             +--------------------------+
| iNaturalist API (v1/v2)      |             | Thermal Printer Driver   |
| (via inaturalistjs)          |             | (WebBluetooth / ESC-POS) |
+------------------------------+             +--------------------------+
```

### 3.2 Core Data Models

#### `SpecimenRecord`
```typescript
interface SpecimenRecord {
  id: string;                  // e.g., "FORAY-20261005-001"
  timestamp: string;           // ISO 8601
  latitude: number;
  longitude: number;
  geoprivacy: "open" | "obscured" | "private";
  fieldNotes: {
    speciesGuess?: string;
    substrate?: string;
    hostTree?: string;
    odor?: string;
    staining?: string;
    rawVoiceTranscript?: string;
  };
  photoSeries: {
    photoId: string;
    googlePhotosUrl?: string;
    localPath?: string;
    blurScore: number;
    isSelected: boolean;
  }[];
  iNatObservationId?: number;
  printedLabelAt?: string;
}
```

---

## 4. MVP Development Milestones

1. **Milestone 1: Field Logger & Label Printer** (Weeks 1–2)
   * Local SQLite setup for offline field notes.
   * Specimen UUID generator.
   * WebBluetooth thermal label layout engine & print driver.
2. **Milestone 2: Google Photos Ingestion & Clustering** (Weeks 3–4)
   * Google Photos OAuth2 connection.
   * Spatial/Temporal clustering algorithm for image bursts.
   * Node.js `sharp` / Laplacian blur filter scoring integration.
3. **Milestone 3: iNaturalist Auto-Upload Bridge** (Weeks 5–6)
   * `inaturalistjs` integration for batch observation creation.
   * Photo attachment uploading and field note metadata mapping.
   * End-to-end integration testing: Field log -> Photo cluster -> Print label -> Publish to iNat.
