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

## Phase 6: NextStrata Cloud Pipeline Jobs & Tokenomics
*Goal: Create a self-sustaining work-for-compute ecosystem for high-intensity processing.*

* **Work-for-Compute Utility Tokens**:
  * Users earn tokens by contributing local off-peak FL compute cycles or generating ZK proofs.
  * Tokens are spent to trigger heavy NextStrata pipeline jobs: automated DNA barcode alignment (ITS/16S), high-resolution 3D canopy photogrammetry, and bulk dataset processing.
* **ZK Soulbound Contribution Badges (SBTs)**:
  * Non-transferable NFT badges commemorating contributions (e.g., *PNW Chanterelle Steward 2026*) without exposing location data.
* **Gated Access to Rare Species Prediction Models**:
  * Protect endangered or highly poached fungi (e.g., rare truffles or *Bridgeoporus nobilissimus*) by requiring users to stake contribution badges or hold reputation scores to access micro-climate prediction radars.

---

## Phase 7: DeSci, Open Data & Grant Funding Integrations
*Goal: Secure non-dilutive funding and integrate with global biodiversity networks.*

* **GBIF & Darwin Core Archives**:
  * Automated pipeline to package privacy-preserved observations into standardized Darwin Core Archive (DwC-A) formats for direct GBIF ingestion.
* **AWS Open Data & Decentralized Storage**:
  * Store public model weights, ZK proof schemas, and open dataset snapshots on AWS S3 Open Data and Filecoin/Arweave.
* **DNA Barcoding Voucher Subsidies**:
  * Partner with community genetics labs to distribute subsidized physical ITS/16S DNA sequencing vouchers to top compute-contributing foragers.

---

## Phase 8: Server-Side Image Processing
*Goal: Faster, heavier image processing for large forays, as an optional complement to on-device scoring.*

* **Server-Side Blur & Quality Scoring**:
  * Run Laplacian variance scoring (e.g. `sharp`) and later-phase vision models on a server worker for bulk or high-resolution batches, where phones are too slow or battery-limited.
  * Triggered by the user after sync; results merge back into the local database. On-device scoring remains the default and works offline.
* **Processing Queue**:
  * Run jobs in a background worker/queue rather than Vercel request handlers, to avoid serverless size and duration limits.

---

## Phase 9: iOS Label Printing
*Goal: Bring Bluetooth label printing to iPhones, where Safari has no WebBluetooth.*

* **Native Wrapper**: Wrap the PWA (e.g. Capacitor) and use a native BLE plugin to talk to the thermal printer.
* **Alternative**: Evaluate a BLE-capable iOS browser app (e.g. Bluefy) as a no-native-code stopgap.
