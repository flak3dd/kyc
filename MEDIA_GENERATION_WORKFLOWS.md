# Media Generation Workflows

**Scope:** KYC Media Engine — how lab media is produced, hygiened, packaged, and handed off to Lab Host arming.  
**Primary app:** `android-boundarylab`  
**Related:** [WORKFLOWS.md](./WORKFLOWS.md) (full lab map) · prompt skill `kyc-media-prompts`

This document is the deep operational and engineering reference for **media generation only**. It mirrors the runtime pipeline in code as of the current tree.

---

## Table of contents

1. [Purpose and boundaries](#1-purpose-and-boundaries)
2. [Architecture](#2-architecture)
3. [Credentials and billing](#3-credentials-and-billing)
4. [Operator procedure](#4-operator-procedure)
5. [Pipeline overview](#5-pipeline-overview)
6. [Stage-by-stage workflows](#6-stage-by-stage-workflows)
7. [Prompt system](#7-prompt-system)
8. [Media hygiene](#8-media-hygiene)
9. [Device fingerprint](#9-device-fingerprint)
10. [Run directory and artifacts](#10-run-directory-and-artifacts)
11. [Lab Host package handoff](#11-lab-host-package-handoff)
12. [Expression packs](#12-expression-packs)
13. [Quality gates](#13-quality-gates)
14. [Learning-loop feedback](#14-learning-loop-feedback)
15. [State machine and UI binding](#15-state-machine-and-ui-binding)
16. [API contracts](#16-api-contracts)
17. [Failure modes and recovery](#17-failure-modes-and-recovery)
18. [Hard locks and non-negotiables](#18-hard-locks-and-non-negotiables)
19. [Source map](#19-source-map)
20. [Appendix: end-to-end data flow](#20-appendix-end-to-end-data-flow)

---

## 1. Purpose and boundaries

The Media Engine produces a **probability-ranked, identity-locked media pack** for authorized KYC / IDV boundary testing:

| Output class | Role in lab tests |
|---|---|
| Document stills | File-chooser / upload sequence (front → back) |
| White wall plate | Locked background for face composite |
| Face still | Silent-front **passive** camera substitute |
| Continuous liveness video | Silent-front **liveness** / continuous inject |
| Expression packs | Optional challenge videos (smile, 360, look L-R) |

**In scope**

- Source import of real ID front + back images  
- AI generation via Rork Toolkit (Cloud Credits)  
- On-device hygiene (JPEG twins, EXIF, video bitrate, noise)  
- Packaging into `kyc_runs/run_*` + `lab_host_package.json`  
- Push into Lab Host arming  

**Out of scope (documented elsewhere)**

- WebView GUM injection and file-chooser intercept → [WORKFLOWS.md §8](./WORKFLOWS.md#8-browser-capture--injection-workflow)  
- Range scoring → [WORKFLOWS.md §10](./WORKFLOWS.md#10-web-range-workflows)  
- AI session review (chat, not media gen) → [WORKFLOWS.md §9](./WORKFLOWS.md#9-session-close-reports-and-ai-review)  

**Authorization**

Use only on systems, identities, and flows you own or have written permission to test. Prefer the Range (`web-boundarylab-range`) before any production provider.

---

## 2. Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  MediaEngineScreen (Compose UI)                                         │
│    • Rork toolkit URL/secret override                                   │
│    • Source front/back pickers                                          │
│    • Create-video toggle · expression pack chips                        │
│    • Run pipeline · step list · push to Lab Host                        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SessionViewModel                                                       │
│    setSourceImageFront/Back → cache copy                                │
│    runMediaEnginePipeline() → init + orchestrator                       │
│    pushToLabHost() → LabHostArmingService.importPackage                 │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PipelineOrchestrator                                                   │
│    initPipeline · runFullPipeline · buildLabHostPackage                 │
│    Step dispatch by AssetType                                           │
└───────┬───────────────────────────────┬─────────────────────────────────┘
        │                               │
        ▼                               ▼
┌───────────────────┐         ┌───────────────────────────────────────────┐
│ RorkAiImageConnector│       │ XaiMediaClient (HTTP adapter)             │
│  textToImage        │──────►│  image-model · video-model via Toolkit    │
│  editImage          │       │  Cloud Credits · SSE for video            │
│  multiEditImage     │       └───────────────────────────────────────────┘
└───────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  KycPromptLibrary          MediaHygiene           DeviceFingerprint     │
│  resolve(promptKey)        reencodeJpeg           presets + timestamps  │
│                            restampExif                                  │
│                            normalizeVideoBitrate                        │
│                            writeMetaSidecar · extractFrameStill         │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  filesDir/kyc_runs/run_<epoch>/
    + manifest.json + lab_host_package.json
```

| Layer | Class | Responsibility |
|---|---|---|
| UI | `MediaEngineScreen` | Operator controls, previews, status |
| Session | `SessionViewModel` | Source import, run, push, events |
| Orchestration | `PipelineOrchestrator` | Step order, fail-closed, packaging |
| Image API façade | `RorkAiImageConnector` | Ready gate + image ops |
| HTTP | `XaiMediaClient` | Toolkit gateway requests |
| Prompts | `KycPromptLibrary` | Asset prompts + fragment resolve |
| Hygiene | `MediaHygiene` | Phone-like compression / EXIF / video |
| Models | `MediaEngineModels` | Steps, packs, fingerprint, manifest |
| Package IO | `LabHostPackageSerializer` | JSON for arming handoff |
| Credentials | `RorkToolkitCredentials` | Runtime → BuildConfig → Config |

---

## 3. Credentials and billing

All generation bills **Rork Cloud Credits** through the Toolkit gateway. There is no direct provider API key in the default path.

### 3.1 Resolution order

`RorkToolkitCredentials.resolve()` (first non-blank secret wins):

| Priority | Source | Typical use |
|---|---|---|
| 1 | SharedPreferences runtime override | Paste secret in Media Engine UI (no rebuild) |
| 2 | `BuildConfig.RORK_TOOLKIT_*` | From `.env` / `local.properties` at assemble |
| 3 | Optional `com.rork.boundarylab.Config` (reflection) | Rork platform inject |
| — | Unconfigured | `source = "none"`; all AI calls fail closed |

Default Toolkit URL: `https://toolkit.rork.com`

### 3.2 Build-time keys

| Env / property | BuildConfig field |
|---|---|
| `EXPO_PUBLIC_TOOLKIT_URL` / `RORK_TOOLKIT_URL` | `RORK_TOOLKIT_URL` |
| `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY` / `RORK_TOOLKIT_SECRET_KEY` | `RORK_TOOLKIT_SECRET_KEY` |

Legacy local keys (`XAI_API_KEY`, `RUNWAY_API_KEY`) may exist for other paths but are **not** the Media Engine default.

### 3.3 Models (via Toolkit → Vercel AI Gateway)

| Operation | Model ID | Endpoint suffix |
|---|---|---|
| Text → image | `xai/grok-imagine-image` | `/v2/vercel/v3/ai/image-model` |
| Image edit / multi-edit | `openai/gpt-image-2` | same + `files[]` |
| Image → video (primary) | `klingai/kling-v2.5-turbo-i2v` | `/v2/vercel/v3/ai/video-model` (SSE) |
| Image → video (fallback) | `klingai/kling-v3.0-i2v` | same |
| Image → video (fallback 2) | `alibaba/wan-v2.6-i2v` | same |
| Text → video (unused in main pack) | `xai/grok-imagine-video` | video-model |

Video i2v uses **local base64** `{type:file}` so on-device frames work without a public URL host. Kling turbo/pro first; Wan as last fallback. Motions prompts are truncated to **900 characters** to avoid provider safety filter trips.

---

## 4. Operator procedure

### 4.1 Preconditions

1. Android device API 24+, BoundaryLab debug APK built with JDK 17.  
2. Rork Toolkit secret configured (runtime paste **or** assemble-time env).  
3. Real **front** and **back** identity-document photos available for import.  
4. Enough Cloud Credits for: 2 edits + 1 T2I + 1 multi-edit + optional 1–4 i2v jobs.  

### 4.2 Step-by-step

```text
1. Dashboard → Media Engine
2. Confirm connector card shows configured (source: runtime | buildconfig | rork-config)
3. Upload ID Front  (gallery / files)
4. Upload ID Back
5. Toggle "Create continuous video" (default ON)
6. Optionally enable expression packs: Smile Ramp, Circular 360, Look L-R
7. Tap Run / Start pipeline
8. Watch steps: PENDING → GENERATING → DONE | FAILED
9. On full success:
     - Inspect previews / run dir path
     - Optional: walk quality gates
     - Push to Lab Host (or open Arming and load package)
10. On failure:
     - Read step errorMessage
     - Fix credentials / credits / network / sources
     - Re-run (full pipeline restarts steps from init)
```

### 4.3 Source image handling

`SessionViewModel.setSourceImageFront/Back`:

1. Content URI opened via `ContentResolver`  
2. Copied to `cacheDir/source_images/{prefix}_{epoch}.{ext}`  
3. Path stored in `MediaEngineState.sourceFrontPath` / `sourceBackPath`  
4. Timeline event logged under UPLOADS  

Pipeline will not start unless **both** paths are non-empty (`hasSourceImages`).

---

## 5. Pipeline overview

### 5.1 Initialization

`PipelineOrchestrator.initPipeline(createVideo, expressionPacks)` builds the ordered step list and picks a random `DeviceFingerprint`.

Default required steps (always):

| Order | Step ID | AssetType | Label | Output | Size |
|---|---|---|---|---|---|
| 1 | `doc_front` | `DOC_FRONT` | Licence Front | `doc_front.png` | 1920×1080 |
| 2 | `doc_back` | `DOC_BACK` | Licence Back | `doc_back.png` | 1920×1080 |
| 3 | `wall_locked` | `WALL_LOCKED` | White Wall Plate | `wall_locked.png` | 1280×720 |
| 4 | `face_still` | `FACE_STILL` | Face Still | `face_still.png` | 1280×720 |

Optional:

| Condition | Step ID | AssetType | Output |
|---|---|---|---|
| `createVideo == true` | `face_continuous` | `FACE_CONTINUOUS` | `face_continuous.mp4` |
| pack enabled | `pack_smile_ramp` | `EXPRESSION_PACK` | `pack_smile_ramp.mp4` |
| pack enabled | `pack_circular_360` | `EXPRESSION_PACK` | `pack_circular_360.mp4` |
| pack enabled | `pack_look_lr` | `EXPRESSION_PACK` | `pack_look_lr.mp4` |

### 5.2 Dependency graph

```text
source_front.png ──► doc_front.png ──┐
                                     ├──► face_still.png ──┬──► face_continuous.mp4
source_back.png  ──► doc_back.png    │                     ├──► pack_smile_ramp.mp4
                                     │                     ├──► pack_circular_360.mp4
               T2I ──► wall_locked.png ──┘                 └──► pack_look_lr.mp4
```

| Step | Prerequisites |
|---|---|
| `doc_front` | `source_front` present |
| `doc_back` | `source_back` present |
| `wall_locked` | Toolkit ready (no prior media) |
| `face_still` | `doc_front.png` **and** `wall_locked.png` on disk |
| `face_continuous` | `face_still.png` exists and length ≥ 100 B |
| expression packs | same as face_continuous |

Execution is **strictly sequential**. First failed step **breaks** the loop; partial manifests may still be written if any assets succeeded earlier.

### 5.3 Run bootstrap (every full run)

```text
runId     = "run_" + System.currentTimeMillis()
runDir    = filesDir/kyc_runs/{runId}/
jpegExif  = runDir/jpeg_exif/
frames    = runDir/frames/

copy sourceFront → runDir/source_front.png
copy sourceBack  → runDir/source_back.png
write device_fingerprint.txt
reset all step statuses → PENDING
```

---

## 6. Stage-by-stage workflows

### 6.1 Document front — `doc_front`

**Intent:** Photorealistic phone-style photograph of the uploaded front ID, preserving all identity fields.

| Item | Value |
|---|---|
| Prompt key | `docFront` |
| API | Image edit (`editImage`) |
| Model | `openai/gpt-image-2` |
| Source | `source_front.png` in run dir |
| Aspect | `16:9` |
| Final PNG | `doc_front.png` |
| JPEG twin | `jpeg_exif/doc_front.jpg` (quality **91**, noise on) |
| Sidecar | `doc_front.meta.txt` |

**Internal flow**

```text
raw_doc_front.png ← imageConnector.editImage(prompt, source_front, …)
raw → copy → doc_front.png
MediaHygiene.reencodeJpeg(png → jpeg_exif twin)
MediaHygiene.restampExif(jpeg, fingerprint, captureIndex)
MediaHygiene.writeMetaSidecar(png, …)
delete raw
captureIndex++
```

**Preserve rules (prompt)**

- No rewrite of text, holograms, barcodes, MRZ, photo, signatures  
- Original colours, card stock texture, edge fidelity  
- Landscape 16:9; no fingers / heavy glare as hard negatives in library  

---

### 6.2 Document back — `doc_back`

Same machinery as front with:

| Item | Value |
|---|---|
| Prompt key | `docBack` |
| Source | `source_back.png` |
| Outputs | `doc_back.png`, `jpeg_exif/doc_back.jpg`, `doc_back.meta.txt` |

Prompt stresses full barcode / MRZ visibility and scannability.

---

### 6.3 Locked white wall — `wall_locked`

**Intent:** Stage-1 background plate used only as the locked wall for the face composite. No subject.

| Item | Value |
|---|---|
| Prompt key | `whiteWallLocked` |
| API | Text-to-image (`textToImage`) |
| Model | `xai/grok-imagine-image` |
| Sources | none (prompt only) |
| Final | `wall_locked.png` 1280×720 |
| JPEG twin | quality **91**, noise on |

**Why separate from face still**

Two-stage composite keeps wall texture/noise stable and reduces generative “repaint the room” drift. Stage 2 must treat this plate as pixel-locked background.

---

### 6.4 Face still — `face_still`

**Intent:** Composite licence portrait identity onto the locked wall — primary passive selfie plate.

| Item | Value |
|---|---|
| Prompt key | `faceStill` |
| API | Multi-image edit (`multiEditImage`) |
| Model | `openai/gpt-image-2` with multiple `files[]` |
| Source order (code) | `[doc_front.png, wall_locked.png]` |
| Aspect | `16:9` |
| Final | `face_still.png` 1280×720 |
| JPEG twin | quality **90**, noise on |

**Identity rules**

- Face must match the **licence portrait**, not an operator selfie  
- Operator selfie (if ever added) is scale/position only and should be masked  
- Head height ≤ 2/3 of frame; equal empty space above head and below chin  
- Neutral expression, eyes open, direct gaze  
- No beauty filter / plastic skin; natural pores and phone grain  

**Fail closed**

If either `doc_front.png` or `wall_locked.png` is missing → step fails immediately (no API call).

---

### 6.5 Continuous liveness — `face_continuous`

**Intent:** Silent-front continuous inject / liveness loop from the locked face still.

| Item | Value |
|---|---|
| Prompt key | `videoConstantLivenessLoop` |
| API | Image-to-video (`generateVideoFromImage`) |
| Requested duration | **10 s** (clamped to provider 5/10) |
| Source | `face_still.png` (min length 100 B) |
| Final | `face_continuous.mp4` |
| Bitrate target | **2_400_000** bps |
| Frame extract | `frames/face_frame_{captureIndex}.jpg` (best-effort) |

**Motion content (short prompt)**

- Natural micro-motion: head sway, soft blinks, tiny expression shifts  
- Brief look left/right near midpoint  
- Continuous motion — no freeze longer than a fraction of a second  
- Same identity, clothing, framing, plain white wall  
- No beauty filter, bokeh, overlays  

**Post-process**

```text
raw_face_continuous.mp4 ← i2v (Kling turbo → Kling v3 → Wan)
MediaHygiene.normalizeVideoBitrate(raw → final, 2.4 Mbps)
if final empty → copy raw as last resort
extractFrameStill(final → frames/)
require final length ≥ 1000 B
```

Errors surface via `XaiMediaClient.lastVideoError` into the step `errorMessage`.

---

### 6.6 Expression packs — `pack_*`

See [§12](#12-expression-packs). Same i2v path as continuous video with:

| Item | Value |
|---|---|
| Duration request | **8 s** (clamped 5/10) |
| Bitrate target | **2_200_000** bps |
| Prerequisite | `face_still.png` |

Pack prompts stay **short and motion-only** so identity stays locked in `face_still` and provider filters are less likely to reject long KYC boilerplate.

---

## 7. Prompt system

**Code:** `KycPromptLibrary`

### 7.1 Registry keys

| Key | Used by step |
|---|---|
| `docFront` | `doc_front` |
| `docBack` | `doc_back` |
| `whiteWallLocked` | `wall_locked` |
| `faceStill` | `face_still` |
| `videoConstantLivenessLoop` | `face_continuous` |
| `videoSmileRamp` | pack smile |
| `videoCircular360` | pack 360 |
| `videoLookLeftRight` | pack look L-R |

`promptForAsset(AssetType, ExpressionPack?)` maps enum → key.

### 7.2 Shared fragments

Fragments are inlined into still prompts (and available for `${NAME}` substitution):

| Fragment | Role |
|---|---|
| `DOC_FACE_ENGINE_NOTE` | Identity locked to licence portrait; selfie is scale guide only; framing rules |
| `STRICT_FACE_FRAMING` | Head upper 2/3; equal margins; no extreme close-up |
| `STRICT_DOC_IDENTITY` | Preserve every document field / security feature |
| `STRICT_IDENTITY` | No morph / drift from licence face |
| `STRICT_BACKGROUND` | Plain white wall, sharp, no bokeh |
| `ANTI_GEN_NEGATIVES` | Forbid beauty, bokeh, studio glamour, UI overlays |
| `ANTI_GEN_POSITIVES` | Pores, phone noise, natural colour, sharp full frame |
| `TECHNICAL_ANTI_GEN` | No motion blur / banding / fake grain artifacts |

### 7.3 Video prompt policy

Still prompts may be long. **Video prompts are deliberately short** (motion timeline only) because:

1. Identity is already fixed in `face_still`  
2. Long KYC boilerplate trips provider safety filters  
3. Client truncates i2v prompts to 900 characters  

Skill `kyc-media-prompts` may document richer narrative prompts for offline / external use; **runtime Android library** is the source of truth for shipped generation.

---

## 8. Media hygiene

**Code:** `MediaHygiene`  
**Order of intent:** compression signature → metadata hygiene → package  

Hygiene does **not** beautify skin. It adds phone-like signatures so assets look camera-captured rather than clean generative renders.

### 8.1 JPEG re-encode + sensor noise

`reencodeJpeg(input, output, quality, addNoise)`:

1. Decode bitmap  
2. Optional `addSensorNoise`:  
   - slight chroma desaturation (~0.92)  
   - sparse pixel noise (~1/250 pixels, ±6 RGB)  
3. Compress JPEG at quality **88–93** (docs/wall: 91, face: 90)  

Applied to **JPEG twins** under `jpeg_exif/`; primary PNGs remain for Lab Host sequence packaging.

### 8.2 EXIF restamp

`restampExif(jpeg, fingerprint, captureIndex)`:

- Make / model / software / lens from fingerprint  
- F-number, ISO  
- Capture datetime from `fingerprint.captureTimestampForIndex(index)`  
- Sequential timestamps spaced by `captureIntervalSec`  

Same fingerprint for **entire run** so the pack looks like one device session.

### 8.3 PNG meta sidecars

`writeMetaSidecar` writes human-readable `.meta.txt` beside each PNG with fingerprint and asset name (for audit / export).

### 8.4 Video bitrate normalize

`normalizeVideoBitrate(input, output, targetBitrate)`:

- Best-effort MediaCodec decode → re-encode H.264 @ target bitrate, 30 fps  
- On failure: **copy original bytes** so the pipeline still has a usable MP4  
- Continuous: 2.4 Mbps · packs: 2.2 Mbps  

### 8.5 Frame still extract

`extractFrameStill` pulls a JPEG from the continuous video into `frames/` for diagnostics / secondary inject. Non-fatal if it fails.

### 8.6 Hygiene flags (manifest)

```json
{
  "exifRestamped": true,
  "jpegTwinWritten": true,
  "compressionReencoded": true,
  "videoBitrateNormalized": true,
  "deviceFingerprintApplied": true,
  "sensorNoiseAdded": true
}
```

Flags accumulate as steps succeed.

---

## 9. Device fingerprint

**Code:** `DeviceFingerprint` + `DeviceFingerprintPresets`

One fingerprint is chosen at `initPipeline` via `random()` and written to `device_fingerprint.txt`.

### 9.1 Presets

| Make | Model | Software | Lens note | f | ISO | Interval (s) |
|---|---|---|---|---|---|---|
| samsung | SM-S931B | One UI 6.1.1 | Galaxy S24 Ultra rear wide | f/1.7 | 50 | 8 |
| samsung | SM-S928B | One UI 6.1 | Galaxy S24+ rear wide | f/1.8 | 64 | 10 |
| Google | Pixel 9 Pro | Android 15 | Pixel 9 Pro rear wide | f/1.7 | 40 | 7 |
| Google | Pixel 8 | Android 14 | Pixel 8 rear wide | f/1.7 | 32 | 12 |
| Apple | iPhone 15 Pro | iOS 17.4 | iPhone 15 Pro back camera | f/1.78 | 25 | 9 |
| Xiaomi | 23116PN5BC | HyperOS 1.0 | Xiaomi 14 rear wide | f/1.6 | 80 | 11 |

`sessionStartEpoch` is set to `System.currentTimeMillis()` when randomized.

### 9.2 Capture timeline

```text
timestamp[i] = sessionStartEpoch + i * captureIntervalSec * 1000
```

Index advances once per successful asset (docs → wall → face → videos).

---

## 10. Run directory and artifacts

### 10.1 Layout

```text
filesDir/kyc_runs/run_<epoch>/
├── source_front.png          # operator imports (copied)
├── source_back.png
├── device_fingerprint.txt
├── doc_front.png
├── doc_front.meta.txt
├── doc_back.png
├── doc_back.meta.txt
├── wall_locked.png
├── wall_locked.meta.txt
├── face_still.png
├── face_still.meta.txt
├── face_continuous.mp4       # if createVideo
├── pack_smile_ramp.mp4       # optional packs
├── pack_circular_360.mp4
├── pack_look_lr.mp4
├── jpeg_exif/
│   ├── doc_front.jpg
│   ├── doc_back.jpg
│   ├── wall_locked.jpg
│   └── face_still.jpg
├── frames/
│   └── face_frame_*.jpg
├── manifest.json
└── lab_host_package.json
```

Raw intermediates (`raw_*`) are deleted after successful hygiene.

### 10.2 `manifest.json`

```json
{
  "runId": "run_…",
  "runDir": "/data/user/0/…/files/kyc_runs/run_…",
  "timestamp": 0,
  "deviceFingerprint": { "make": "…", "model": "…", "…": "…" },
  "hygieneFlags": { "…": true },
  "assets": [
    {
      "name": "doc_front.png",
      "assetType": "DOC_FRONT",
      "path": "…",
      "mimeType": "image/png",
      "width": 1920,
      "height": 1080,
      "jpegExifTwin": "…/jpeg_exif/doc_front.jpg",
      "metaSidecar": "…/doc_front.meta.txt"
    }
  ],
  "expressionPacks": ["smile_ramp"]
}
```

### 10.3 Partial runs

If at least one asset succeeded before a failure, the orchestrator still writes `manifest.json` and `lab_host_package.json` from whatever is in `manifestAssets`. If **zero** assets succeeded → `errorMessage = "Pipeline failed — no assets generated"`.

---

## 11. Lab Host package handoff

### 11.1 Package construction

`buildLabHostPackage(runDir, assets, fingerprint)` maps generated files into armable structure:

| Package field | Mapping |
|---|---|
| Sequence slot 1 | `DOC_FRONT` → role `ROLE_DOC_FRONT` |
| Sequence slot 2 | `DOC_BACK` → role `ROLE_DOC_BACK` |
| Sequence slot 3 | `FACE_CONTINUOUS` → role `ROLE_FACE_CONTINUOUS` |
| Silent passive | `FACE_STILL` → bridge `https://cdn.assets.edge/silent/passive` |
| Silent liveness | `FACE_CONTINUOUS` → bridge `https://cdn.assets.edge/silent/liveness` |
| Size guide | 1920×1080 document capture 16:9 |

### 11.2 Default arming policy baked into package

| Field | Value |
|---|---|
| `takeoverEnabled` | `true` |
| `cameraPolicy` | `SUBSTITUTE` |
| `cameraTakeoverMode` | `MEDIA_SEQUENCE` |
| `silentFrontEnabled` | `true` |
| `preferHtmlVideo` | `true` |
| `injectMode` | `CONTINUOUS_DEFAULT` |
| Techniques | `INJ-04`, `INJ-05`, `INJ-06`, `INJ-09`, `INJ-10`, `INJ-13` |

### 11.3 Push to Lab Host

`SessionViewModel.pushToLabHost()`:

```text
getLastLabHostPackage()
  → read lab_host_package.json from lastManifest.runDir
  → LabHostArmingService.importPackage(pkg)
  → update labHostArmed, labReadiness, browserHostConfig
  → timeline event
```

Arming still requires operator confirmation of readiness chips (silent media + seed + SUBSTITUTE). After arm, **reload the KYC page** so inject bootstrap sees the new seed.

### 11.4 Bridge URL model (consumption)

After arming, Lab Host serves:

```text
https://cdn.assets.edge/seq/{slot}      → document sequence
https://cdn.assets.edge/silent/passive  → face_still
https://cdn.assets.edge/silent/liveness → face_continuous
```

Never inject raw `file://` into HTTPS pages — quality gate `no_file_inject` enforces this design.

---

## 12. Expression packs

**Enum:** `ExpressionPack`

| Enum | `id` | Label | Prompt key | File |
|---|---|---|---|---|
| `SMILE_RAMP` | `smile_ramp` | Smile Ramp | `videoSmileRamp` | `pack_smile_ramp.mp4` |
| `CIRCULAR_360` | `circular_360` | Circular 360 | `videoCircular360` | `pack_circular_360.mp4` |
| `LOOK_LR` | `look_lr` | Look L-R | `videoLookLeftRight` | `pack_look_lr.mp4` |

### 12.1 Motion timelines (runtime prompts)

**Smile ramp**

- Neutral → gradual smile over ~3 s → hold → return to neutral  
- Continuous motion, soft blinks  

**Circular 360**

- Slow head turn left → slightly down → right → center  
- Moderate continuous orbit, not extreme profile freeze  

**Look L-R**

- Look left → center → look right → center  
- Hold each direction ~2 s  

All packs: keep same face, clothing, white wall; head in upper two-thirds; no beauty/bokeh.

### 12.2 UI control

`toggleExpressionPack` mutates `enabledExpressionPacks` in state. Packs are re-materialized into steps only on `initPipeline` (called at the start of `runMediaEnginePipeline`).

### 12.3 Learning-loop apply

`applySuggestions(ApplySuggestions)` can pre-select packs from `suggestedPacks` ids for the next attempt.

---

## 13. Quality gates

**Code:** `defaultQualityGates()` — operator checklist (not automated classifiers).

| ID | Label | What to verify |
|---|---|---|
| `beauty_skin` | No beauty/plastic skin | Natural texture, no smoothing |
| `no_bokeh` | No bokeh / soft background | Sharp wall, full DOF |
| `doc_glare` | No doc glare/fingers/cropped barcode | Full card, readable, no fingers |
| `identity_drift` | No identity drift | Face still matches licence photo |
| `video_freeze` | No video freeze > 300ms | Continuous liveness motion |
| `no_file_inject` | No file:// inject on https | Bridge URLs only |

Recommended review order after a successful run:

1. Documents (OCR readability + no hallucinated fields)  
2. Wall plate (plain, no objects)  
3. Face still (identity + framing + skin)  
4. Continuous video (freeze / fps / loop)  
5. Packs if used for challenge paths  

---

## 14. Learning-loop feedback

**Models:** `LearningEvent`, `ApplySuggestions`, `LearningLoopState`

| Concept | Detail |
|---|---|
| Events | Timestamped type/label/detail during KYC sessions |
| Auto-pause heuristic | ≥ 8 events **or** ≥ 30 s recording |
| APPLY.json | `suggestedPacks`, `hostFlagOverrides`, `notes` |
| Apply path | `PipelineOrchestrator.applySuggestions` → set packs |

Used to close the loop: session outcomes → next Media Engine configuration without hand-editing every run.

---

## 15. State machine and UI binding

### 15.1 Step status

```text
PENDING → GENERATING → DONE
                    ↘ FAILED  (pipeline stops)
```

### 15.2 `MediaEngineState` fields

| Field | Role |
|---|---|
| `steps` | Ordered pipeline steps |
| `isRunning` | Mutex: second `runFullPipeline` is ignored |
| `currentStepIndex` | Active step or `-1` |
| `lastRunDir` / `lastManifest` | Last successful packaging context |
| `enabledExpressionPacks` | Pack selection |
| `createVideoEnabled` | Include `face_continuous` |
| `deviceFingerprint` | Hygiene profile |
| `sourceFrontPath` / `sourceBackPath` | Imported sources |
| `errorMessage` | Last failure detail |

Derived:

- `hasSourceImages` — both sources set  
- `allRequiredDone` — all non-pack steps DONE  
- `anyFailed` — any FAILED  

### 15.3 ViewModel events

On pipeline progress, timeline receives:

- Start (with credential source)  
- Per-step DONE / FAILED  
- Complete or failed summary  

Credential gate before launch:

```text
if !isRorkAiConfigured → ERROR event, do not run
if !hasSourceImages → return silently (UI should also block)
```

---

## 16. API contracts

### 16.1 Image model request (shape)

```json
{
  "model": "xai/grok-imagine-image | openai/gpt-image-2",
  "prompt": "…",
  "n": 1,
  "aspectRatio": "16:9",
  "providerOptions": {},
  "files": [ /* edit / multi-edit only */ ]
}
```

Headers include `Authorization: Bearer <toolkit secret>`, `ai-gateway-protocol-version`, model id headers. Response images written via first data URI / URL in body.

### 16.2 Video model (i2v) request (shape)

```json
{
  "model": "klingai/kling-v2.5-turbo-i2v",
  "prompt": "… ≤900 chars …",
  "duration": 5 | 10,
  "aspectRatio": "16:9",
  "providerOptions": {
    "klingai": {
      "pollIntervalMs": 5000,
      "pollTimeoutMs": 1200000,
      "mode": "std|pro",
      "sound": "off"
    }
  },
  "image": { "type": "file", "…": "base64…" }
}
```

Accept: `text/event-stream`. Client poll timeout up to ~20 minutes. Upload preparation resizes source frames for size limits (~3 MB encode path).

### 16.3 Timeouts

| Client | Timeout |
|---|---|
| HTTP request / socket | 1_300_000 ms (~21.6 min) for video |
| Connect | 30_000 ms |
| i2v poll | 1_200_000 ms |

---

## 17. Failure modes and recovery

| Symptom | Likely cause | Recovery |
|---|---|---|
| Run refuses to start; UPLOADS missing | Only one side of ID imported | Import both front and back |
| Immediate “connectors not configured” | No secret | Paste in UI or rebuild with env secret |
| All image steps fail | Credits exhausted / network / gateway | Check Toolkit balance and device network |
| `doc_*` fail only | Bad source / edit model rejection | Re-crop source; re-try; check prompt filters |
| `wall_locked` fails | T2I model / credits | Retry; confirm image-model path |
| `face_still` fails “Missing prerequisite” | Prior step failed or deleted files | Re-run full pipeline |
| `face_still` multi-edit fails | Model rejection / size | Check face identity in doc; re-gen wall |
| `face_continuous` missing face_still | Video before still | Ensure still DONE first (order is automatic) |
| Video fails all models | Kling/Wan rejection or timeout | Shorten motion prompt; check `lastVideoError`; retry later |
| Video empty after normalize | Transcode edge case | Code copies raw as last resort; if still empty, re-run step |
| Package push not ready | No continuous video / silent media | Enable create video and re-run; re-import package |
| Identity drift in stills | Model variance | Re-run face_still; verify doc portrait quality |
| Frozen liveness on Range | Still image injected as continuous | Prefer `CONTINUOUS_DEFAULT` + real mp4 |
| Portrait / wrong aspect | Model ignored 16:9 | Reject and regenerate; all consumers assume landscape |

### 17.1 Fail-closed rules (summary)

| Gate | Behavior |
|---|---|
| Missing toolkit secret | Connector returns false; no network call |
| Missing dual sources | Orchestrator sets error; no run |
| Concurrent run | Second `runFullPipeline` no-ops |
| Missing face_still for video | Explicit step error |
| Empty video file (< 1 KB) | Step FAILED |
| Inject path later | Only bridge URLs accepted (arming layer) |

---

## 18. Hard locks and non-negotiables

These apply to every generated still and every video frame:

1. **Landscape 16:9 only** — width > height. Never portrait, never 9:16, never square.  
2. **Native device labels** when packaging for Lab Host — do not invent/rename scan labels if device scan strings are available; package roles map to fixed filenames in this pipeline.  
3. **Identity locked** to licence portrait for the face set — no morph, no beauty filter, no ethnicity/age drift.  
4. **Document fidelity** — no rewritten fields, no hallucinated MRZ/barcode/text.  
5. **Face framing** — head height ≤ 2/3 of media height; equal margins above head and below chin.  
6. **Wall lock** — Stage-1 wall plate is background truth; Stage-2 must not repaint/relight the wall.  
7. **No `file://` on HTTPS** — bridge via `https://cdn.assets.edge/...` only.  
8. **Authorized use only** — lab / Range first; production only with written authorization.  

---

## 19. Source map

| Concern | Path |
|---|---|
| Orchestrator | `android-boundarylab/.../mediaengine/PipelineOrchestrator.kt` |
| Models / packs / fingerprint | `.../mediaengine/MediaEngineModels.kt` |
| Prompts | `.../mediaengine/KycPromptLibrary.kt` |
| Hygiene | `.../mediaengine/MediaHygiene.kt` |
| Image connector | `.../mediaengine/RorkAiImageConnector.kt` |
| HTTP client | `.../mediaengine/XaiMediaClient.kt` |
| Credentials | `.../mediaengine/RorkToolkitCredentials.kt` |
| Package JSON | `.../mediaengine/LabHostPackageSerializer.kt` |
| UI | `.../ui/screens/MediaEngineScreen.kt` |
| Session glue | `.../viewmodel/SessionViewModel.kt` |
| Arming import | `.../capture/arming/` + `LabHostArmingService` |
| Env example | `android-boundarylab/.env.example` |
| Broader lab workflows | `WORKFLOWS.md` |
| External prompt skill | `~/.grok/skills/kyc-media-prompts/SKILL.md` |

---

## 20. Appendix: end-to-end data flow

```text
[Operator]
   │ pick front/back ID photos
   ▼
cacheDir/source_images/*
   │ setSourceImages
   ▼
initPipeline(createVideo, packs) ──► steps[] + DeviceFingerprint
   │
   ▼
runFullPipeline
   │
   ├─► edit(source_front)  → hygiene → doc_front.png (+ jpeg twin)
   ├─► edit(source_back)   → hygiene → doc_back.png
   ├─► t2i(whiteWall)      → hygiene → wall_locked.png
   ├─► multiEdit(doc_front, wall) → hygiene → face_still.png
   ├─► i2v(face_still, liveness prompt, 10s) → bitrate → face_continuous.mp4
   └─► for each pack: i2v(face_still, pack prompt, 8s) → pack_*.mp4
   │
   ▼
manifest.json + lab_host_package.json
   │
   ▼ pushToLabHost / Arming import
   │
   ▼
Lab Host SUBSTITUTE
   sequence: doc_front → doc_back → (face video)
   silent:   passive=face_still, liveness=face_continuous
   │
   ▼
Provider / Range exercise → session timeline → report / AI review
```

### Minimal successful asset set for KYC readiness

| Asset | Required for KYC-ready arming? |
|---|---|
| `doc_front` + `doc_back` | Yes for document sequence tests |
| `face_still` (passive) | Yes (silent passive) |
| `face_continuous` (liveness) | Strongly preferred; readiness needs passive **or** liveness; continuous inject wants video |
| Expression packs | Optional challenges only |

Formula reminder (arming layer, not Media Engine):

```text
cameraTakeoverEnabled
AND cameraInterceptPolicy == SUBSTITUTE
AND !mediaSeedEmpty
AND (silentFrontPassiveUrl != null OR silentFrontLivenessUrl != null)
```

---

### Quick reference: generate → arm → test

```text
1. Media Engine: dual ID sources + toolkit secret
2. Run pipeline until all required steps DONE
3. Quality-gate stills and video
4. Push package / Arm Lab Host (SUBSTITUTE baseline)
5. Reload target page
---

## 21. Sovereign Cluster ComfyUI Workflows

For local on-premise execution on Sovereign Spark / DGX cluster, ComfyUI workflows are maintained in `comfyui_workflows/`:

| Workflow File | Core Technology | Primary Role in IDV/KYC Boundary Testing |
|---|---|---|
| `id_document_editor.json` | SDXL + ControlNet | High-fidelity synthetic ID front/back generation & text layout verification |
| `face_swap_liveness.json` | ReActor + CodeFormer | Identity transfer onto target challenge frames |
| `spoof_artifact_injector.json` | SDXL img2img | Injection of presentation attack artifacts (screen moire, reflections, paper grain) |
| `krea2_identity_edit.json` | Krea 2 + `conradlocke/krea2-identity-edit` | **Instruction-based identity-preserving portrait edit & restaging** |

### Krea 2 Identity Edit Specification
- **Model Card:** [`conradlocke/krea2-identity-edit`](https://huggingface.co/conradlocke/krea2-identity-edit)
- **Node Extension:** [`comfyui-krea2edit`](https://github.com/lbouaraba/comfyui-krea2edit) (`custom_nodes/comfyui-krea2edit`)
- **Dual Conditioning Architecture:**
  - `Krea2EditModelPatch`: Prepends clean VAE-encoded source latent tokens (`source_latent` frame 1) to the MMDiT sequence. Recommended `ref_boost: 4.0`, `fit_mode: "fit"`.
  - `Krea2EditGroundedEncode`: Text encoder sees the source portrait image during instruction reading via Qwen3-VL (`qwen3vl_4b_fp8_scaled.safetensors`). Recommended `grounding_px: 768`.
- **Base Models:**
  - UNet: `krea2_turbo_fp8_scaled.safetensors` (10 steps, Euler, simple scheduler, CFG 1.0)
  - Text Encoder: `qwen3vl_4b_fp8_scaled.safetensors` (CLIP type `krea2`)
  - VAE: `ae.safetensors`
- **LoRA Variants:**
  - Recommended: `krea2_identity_edit_v1_2.safetensors`
  - Low-VRAM: `krea2_identity_edit_v1_2_r128.safetensors` (0.91 GB), `krea2_identity_edit_v1_2_r64.safetensors` (0.46 GB)
- **Download Utility:**
  ```bash
  python3 dataset_scripts/download_krea2_identity_edit.py --variant v1_2
  ```

---

*Document version: 2026-09-14 · Aligned with `PipelineOrchestrator`, `XaiMediaClient`, ComfyUI local cluster workflows, and `conradlocke/krea2-identity-edit` identity restaging.*

