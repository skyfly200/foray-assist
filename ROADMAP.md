# Foray Assistant App — Product & Architectural Roadmap (ROADMAP.md)

This document outlines the post-MVP evolution of the Foray Assistant App, detailing advanced features across computer vision, Zero-Knowledge (ZK) cryptography, private federated learning (zk-FL), decentralized science (DeSci) tokenomics, and cloud pipeline integrations.

---

## Phase 2: Advanced On-Device Computer Vision & Diagnostic Quality Scoring
*Goal: Expand beyond simple Laplacian blur checks to intelligent macro-feature detection.*

* **Diagnostic Morphological Feature Detection**:
  * Utilize TensorFlow.js or ONNX Runtime Web to verify that a series of photos captures all necessary diagnostic angles required for Research Grade identification (Cap top, Gill/Pore underside, Stipe/Base, and Habitat/Substrate).
* **Automated Bounding & Cropping**:
  * Auto-crop specimen subjects out of cluttered background foliage before sending to iNaturalist or local models.
* **Lighting & Exposure Assessment**:
  * Filter out overexposed or harsh flash photos to ensure true color representation for species identification.

---

## Phase 3: Voice-Guided Collection for Beginners
*Goal: Walk new foragers through a responsible, well-documented collection hands-free, using the offline Whisper pipeline.*

* **Guided Collection Flow**:
  * Spoken step-by-step prompts for each find: photograph cap top, gills/pores, stipe and base, habitat; note substrate, host tree, odor, and spore-print/staining checks; record the specimen ID.
  * Hands-free: the user answers by voice and the assistant fills the structured attribute form from transcribed answers.
* **Completeness Checks**:
  * The assistant tracks which diagnostic photos and attributes are still missing for the current find and prompts for them before moving on.
* **Safety & Ethics Guidance**:
  * Reminders on look-alikes, never eating unidentified fungi, local collecting rules, and leaving some of the patch behind.
* **Offline First**:
  * Prompts, flow logic and any speech output (on-device TTS) work with no connectivity.

---

## Phase 4: Zero-Knowledge (ZK) Location Privacy & Environmental Proofs
*Goal: Enable scientific contribution to Species Distribution Models (SDMs) without disclosing exact secret foraging spots.*

* **ZK-SNARK Geofencing Circuits (Noir / Circom)**:
  * Generate proofs on-device confirming that an observation took place within a broad ecological/county boundary without revealing precise latitude/longitude.
* **GIS Raster Hash Attestation**:
  * Prove cryptographically that environmental feature vectors (elevation, soil pH, canopy cover, annual precipitation) were truthfully derived from an official GIS map layer stored locally on the phone.
* **iNaturalist Observation Field (OFV) Integration**:
  * Store the ZK Proof Commitment Hash (`ZK-Location-Proof-Hash`) and verified environmental vectors into custom iNaturalist Observation Fields for public scientific indexing.

---

## Phase 5: Private Federated Learning (zk-FL) & Edge Model Training
*Goal: Train regional species prediction models directly on user devices while keeping spatial data strictly private.*

* **Nightly Charging Training Scheduler**:
  * Run local model training epochs ($\Delta W$) via WebGPU or TFLite only when the phone is connected to Wi-Fi, plugged into a charger overnight, and above 80% battery.
* **Local Differential Privacy (LDP)**:
  * Add Gaussian/Laplacian noise ($\epsilon$-DP) to local model weight updates to prevent gradient inversion and spatial triangulation attacks.
* **Secure Aggregation & zk-Proof Verification**:
  * Verify client training iterations on the backend using ZK proofs before merging weights into global species distribution models.

---

## Phase 6: Specimen Forms & ID Barcodes (BLE Printing)
*Goal: Turn the digital record into the paper trail a collection needs: printed field data forms and scannable ID labels, from the phone, in the field.*

* **Printable Foray Specimen Forms**:
  * One-page collection/field data sheet per find (or per foray): Specimen ID, date/time, collector, locality (respecting each find's geoprivacy), habitat, substrate, host tree, odor/texture/staining, species guess, notes, photo thumbnails and a QR/barcode linking back to the record.
  * Print to BLE thermal printers (58 mm / 80 mm receipt-style and 4-inch label printers) with selectable layouts, or export a PDF for ordinary printers.
* **ID Barcodes**:
  * Print ID labels as Code 128, QR or Data Matrix in bulk or one at a time, in sizes for bags, packets, tubes and photo cards (extends the 50×30 mm tag from the MVP).
  * Scan a printed code with the phone camera (BarcodeDetector API where available, with a WASM fallback) to jump straight to that record.
* **NFC Tags (alternative to printed codes)**:
  * Write the Specimen ID (as an NDEF record, with the record URI) to NFC stickers/tags that attach to bags, tubes and packets, and tap a tag to open its record. Uses the Web NFC API (Chrome on Android; not available on iOS Safari). NFC tags are rewritable, survive damp and dirt better than paper, and need no printer, so they sit alongside printed barcodes and QR codes as a first-class option for tracking tags.
* **Printer Profiles & Batch Queue**:
  * Saved profiles for paper width, label size, protocol (ESC/POS or TSPL) and darkness; a print queue that survives going offline and reconnecting.

---

## Phase 7: Preprinted ID Code Sheets & Record Association
*Goal: Let collectors label specimens before a record exists (no printer needed in the field) and tie the physical labels to digital records afterwards.*

* **Reserved Code Blocks**:
  * Generate sheets or rolls of unique, pre-allocated IDs (with check characters) from a **set** reserved for this user (a set is 1,024 IDs; a sheet is a range inside it), printed in advance on adhesive label sheets from the app (PDF) or over BLE.
  * Multiple identical stickers per code, for the bag, the photo card and the notebook.
* **Associating Codes with Records**:
  * Scan or type a preprinted code to attach it to a find, or create a find from a scanned code. Codes can be used before the record exists and reconciled later.
  * An inventory of codes: unassigned, assigned, voided or lost; duplicate and out-of-block detection; offline-safe reservation so two devices never issue the same code.
* **Pre-programmed NFC Tags**:
  * Write blocks of IDs to NFC tags in advance, then tap a tag during collection to attach that code to a find (the same association flow as scanning a preprinted sticker). Tag inventory tracks which NFC tags are written, assigned or blank.
* **Reconciliation Tools**:
  * Flag codes used on a physical specimen but with no record yet, and records with no physical label.

---

## Phase 8: NextStrata Cloud Pipeline Jobs & Tokenomics
*Goal: Create a self-sustaining work-for-compute ecosystem for high-intensity processing.*

* **Work-for-Compute Utility Tokens**:
  * Users earn tokens by contributing local off-peak FL compute cycles or generating ZK proofs.
  * Tokens are spent to trigger heavy NextStrata pipeline jobs: automated DNA barcode alignment (ITS/16S), high-resolution 3D canopy photogrammetry, and bulk dataset processing.
* **ZK Soulbound Contribution Badges (SBTs)**:
  * Non-transferable NFT badges commemorating contributions (e.g., *PNW Chanterelle Steward 2026*) without exposing location data.
* **Gated Access to Rare Species Prediction Models**:
  * Protect endangered or highly poached fungi (e.g., rare truffles or *Bridgeoporus nobilissimus*) by requiring users to stake contribution badges or hold reputation scores to access micro-climate prediction radars.

---

## Phase 9: DeSci, Open Data & Grant Funding Integrations
*Goal: Secure non-dilutive funding and integrate with global biodiversity networks.*

* **GBIF & Darwin Core Archives**:
  * Automated pipeline to package privacy-preserved observations into standardized Darwin Core Archive (DwC-A) formats for direct GBIF ingestion.
* **AWS Open Data & Decentralized Storage**:
  * Store public model weights, ZK proof schemas, and open dataset snapshots on AWS S3 Open Data and Filecoin/Arweave.
* **DNA Barcoding Voucher Subsidies**:
  * Partner with community genetics labs to distribute subsidized physical ITS/16S DNA sequencing vouchers to top compute-contributing foragers.

---

## Phase 10: Server-Side Image Processing
*Goal: Faster, heavier image processing for large forays, as an optional complement to on-device scoring.*

* **Server-Side Blur & Quality Scoring**:
  * Run Laplacian variance scoring (e.g. `sharp`) and later-phase vision models on a server worker for bulk or high-resolution batches, where phones are too slow or battery-limited.
  * Triggered by the user after sync; results merge back into the local database. On-device scoring remains the default and works offline.
* **Processing Queue**:
  * Run jobs in a background worker/queue rather than Vercel request handlers, to avoid serverless size and duration limits.

---

## Phase 11: iOS Label Printing
*Goal: Bring Bluetooth label printing to iPhones, where Safari has no WebBluetooth.*

* **Native Wrapper**: Wrap the PWA (e.g. Capacitor) and use a native BLE plugin to talk to the thermal printer.
* **Alternative**: Evaluate a BLE-capable iOS browser app (e.g. Bluefy) as a no-native-code stopgap.

---

## Phase 12: Shared Forays & Societies (Online)
*Goal: Let people share a foray and see everyone's observations in one set, and let societies such as the Front Range Mycological Society (FRMS) and the Colorado Mycological Society (CMS) run events and issue their own IDs.*

* **Shared Forays**:
  * A shared foray is a grouping record with a short join code or QR, separate from the observations themselves. Members join with the code; each observation points to one or more forays. Everyone's finds appear together in one combined set, live while anyone has signal (Supabase Realtime), with access limited to members by row-level security.
  * IDs always identify the **author** (their network and set), never the foray, so two members can never produce the same ID, even offline in the same woods. Nobody edits anyone else's record; other members add comments, ID suggestions and confirmations as separate records.
* **Societies**:
  * A society (FRMS, CMS, and others) is an organisation with members, roles (officers, foray leaders) and its own **society network** in the `U`–`Z` ID class, used for voucher/collection numbers and preprinted sheets issued under the society's name. Members' own finds keep their personal network.
  * Society foray events: leaders create a shared foray, members join by code, and the society gets a combined record afterwards (exportable as Darwin Core, see Phase 9).
* **Privacy**:
  * Members only see locations as precisely as each author's per-find setting allows; leaving a foray removes live access but not past contributions the author chose to share.

---

## Phase 13: Nearby Mesh Sync & Find Alerts (Bluetooth, Native)
*Goal: Keep a crowd of devices in sync in real time with no signal, and tell nearby foragers about finds, using the shared foray and ID space from Phase 12.*

* **Why native**: browsers can connect to Bluetooth devices but cannot advertise or accept connections, and standard Bluetooth Mesh is built for tiny control messages, not records and photos. This phase needs the native wrapper from Phase 11 with BLE peripheral/central plugins. iOS restricts background Bluetooth, so Android comes first.
* **Three tiers, opportunistic and store-and-forward**:
  1. **Nearby alerts**: tiny messages of about 100 bytes sent over Bluetooth advertising (the ID, a coarse location cell, a species code, a timestamp), for example "3 finds within 200 m".
  2. **Record sync**: when two phones meet, they exchange the records the other is missing (a few KB of metadata) and relay onward as people move, so a crowd converges without anyone having signal.
  3. **Photos**: bulk transfer over Nearby Connections / Wi-Fi Direct when peers agree, otherwise wait for the cloud.
* **Conflict-free by design**: every record has a globally unique author-based ID and is changed only by its author, so merging devices needs no coordination; comments and suggestions are separate records.
* **Privacy and abuse**:
  * Alerts are coarse by default, opt-in, limited to members of the same shared foray, and encrypted with a key shared through the join code (non-members see noise). They respect each find's location setting and suppress sensitive species.
  * Advertised records are signed by the author's device key so strangers can't spoof finds.
* **Share a single find**: send one observation (photos, notes, voice notes, ID) to a nearby device, previewed and approved by the receiver, deduplicated by ID, never overwriting local records. Until the native wrapper exists this can travel through the Web Share API (Android Nearby Share) or a file.
* **Costs to manage**: continuous scanning and advertising drain the battery, so scanning is duty-cycled and only active during a foray.
