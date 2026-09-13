# BoundaryLab — Comprehensive Workflow Guide

**Repository:** `rork-ikycu`  
**Apps:** `android-boundarylab` · `web-boundarylab-range` · `functions`  
**Audience:** Lab operators, security researchers, and engineers running **authorized** identity-verification (KYC/IDV) boundary tests.

This document is the single operational map of every major workflow in the monorepo: how media is produced, how the Lab Host is armed, how capture surfaces are exercised against the Range, how sessions are scored, and how artifacts are shared and analyzed.

---

## Table of contents

1. [Purpose and authorization](#1-purpose-and-authorization)
2. [System map](#2-system-map)
3. [End-to-end lab workflow (canonical)](#3-end-to-end-lab-workflow-canonical)
4. [Android app workflows](#4-android-app-workflows)
5. [Media Engine pipeline workflow](#5-media-engine-pipeline-workflow)
6. [Lab Host arming workflow](#6-lab-host-arming-workflow)
7. [Bundled session workflows](#7-bundled-session-workflows)
8. [Browser capture / injection workflow](#8-browser-capture--injection-workflow)
9. [Session close, reports, and AI review](#9-session-close-reports-and-ai-review)
10. [Web Range workflows](#10-web-range-workflows)
11. [Share / functions workflow](#11-share--functions-workflow)
12. [Technique index (INJ-\*)](#12-technique-index-inj-)
13. [Readiness gates and fail-closed rules](#13-readiness-gates-and-fail-closed-rules)
14. [Build, verify, and audit workflows](#14-build-verify-and-audit-workflows)
15. [Operator checklists](#15-operator-checklists)
16. [Failure modes and recovery](#16-failure-modes-and-recovery)
17. [Data locations and artifacts](#17-data-locations-and-artifacts)
18. [Glossary](#18-glossary)

---

## 1. Purpose and authorization

BoundaryLab is a **controlled lab** for testing how identity-verification capture surfaces behave when:

- document upload (`input type=file` / chooser),
- main-frame `getUserMedia`,
- iframe / widget `getUserMedia`,
- display media, and
- browser fingerprinting

are exercised under operator-controlled media substitution on a **Lab Host** Android WebView, against a **mock provider** (the Range) or a real provider URL the operator is authorized to test.

| Rule | Detail |
|---|---|
| Authorized use only | Use only on systems, accounts, and flows you own or have written permission to test. |
| Lab default | Prefer the Range (`web-boundarylab-range`) as the target before any production KYC host. |
| No production claims | Passing the Range does **not** mean production IDV will accept the same media. |
| Secrets | Toolkit credentials come from `.env` / `local.properties` → `BuildConfig`. Never commit secrets. |
| Backup | Android app sets `allowBackup=false` to reduce offline extraction of lab media. |

---

## 2. System map

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                         Operator device (Android)                        │
│  BoundaryLab APK                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │ Media Engine│→│ Arming       │→│ Lab Host / Chrome WebView        │  │
│  │ (generate   │  │ (config +   │  │ (GUM inject, chooser intercept, │  │
│  │  assets)    │  │  package)   │  │  bridge URLs, telemetry)        │  │
│  └─────────────┘  └──────────────┘  └──────────────┬──────────────────┘  │
│         │                 │                        │                     │
│         │                 │                        ▼                     │
│         │                 │              Session timeline + observations │
│         │                 │                        │                     │
│         └─────────────────┴────────────────────────┤                     │
│                                                    ▼                     │
│                              KYC Test Report · AI Review · History       │
└──────────────────────────────────────────────────────────────────────────┘
         │ Rork Toolkit (optional credits)          │ HTTPS to target
         ▼                                          ▼
  toolkit.rork.com                     ┌────────────────────────────┐
  (image/video/chat)                   │  Target under test         │
                                       │  • Range (mock provider)   │
                                       │  • or authorized KYC URL   │
                                       └─────────────┬──────────────┘
                                                     │ telemetry (web)
                                                     ▼
                                       Operator Console · Export · Share
                                                     │
                                                     ▼
                                       Cloudflare Worker + Durable Object
                                       POST/GET /share (24h TTL)
```

| Component | Path | Role |
|---|---|---|
| Android lab | `android-boundarylab/` | Media generation, arming, WebView lab host, session telemetry, reports |
| Range (web) | `web-boundarylab-range/` | Mock KYC provider + anti-spoof scoring + operator console |
| Functions | `functions/` | Temporary share-link storage for session exports |
| Project map | `rork.json` | Declares the three apps for the Rork platform |

---

## 3. End-to-end lab workflow (canonical)

This is the **primary** operator path for a full boundary test against the Range.

```text
[0] Preconditions
    → Android device (API 24+), camera/mic permissions
    → Rork toolkit credentials if Media Engine / AI Review needed
    → Range URL reachable from the device WebView
        (local: host machine IP:8080, or deployed Range)

[1] Generate lab media          Media Engine screen
[2] Arm Lab Host                Arming screen (baseline SUBSTITUTE)
[3] Open target in browser      Chrome Browser / workflow Lab Host
[4] Drive verification flow     Provider steps (docs → liveness → result)
[5] Watch interceptions         Timeline + observations
[6] End session                 Save session
[7] Review report               KYC Test Report (on-device, no network)
[8] Optional AI deep analysis   AI Review (requires credits)
[9] Optional Range console      Export / Share link for collaboration
```

### Step detail

| Step | UI route (Android) | Success criteria |
|---|---|---|
| 1 Generate media | `media_engine` | Pipeline steps all `DONE`; run dir has `doc_front`, `doc_back`, `face_still`, optional video; `lab_host_package.json` present |
| 2 Arm | `arming` | Takeover ON, policy **SUBSTITUTE**, media seed non-empty, readiness chips green |
| 3–4 Drive flow | `chrome_browser` or `workflow_runner` | Page loads; GUM / file chooser intercepts appear on timeline |
| 5 Observe | `session_timeline` | Observations include `gum`, capture, navigation, optional iframe/Sumsub |
| 6 End | Dashboard / runner | Session saved to history with events + observations |
| 7 Report | `kyc_test_report/{sessionId}` | Checklist computed; critical fails highlighted |
| 8 AI Review | `ai_review/{sessionId}` | Structured provider profile + optional generated workflow (if API succeeds) |
| 9 Range share | Web `/console` | JSON download or share link (`/share/:id`) |

### Parallel web-only path (no Android)

Use the Range alone to baseline **target-side** detection without Lab Host injection:

1. Open Range `/` → **Verification flow** (`/verify`).
2. Open `/console` in another tab (BroadcastChannel + sessionStorage sync).
3. Complete doc front/back, main-frame liveness, iframe widget.
4. Inspect verdict, export JSON, optional share link.

---

## 4. Android app workflows

### 4.1 Navigation graph

Defined in `AppNavigation.kt`:

```text
splash
  └─► dashboard  (alias: home)
        ├─► arming
        ├─► media_engine
        ├─► workflow_selection → workflow_runner
        ├─► chrome_browser
        ├─► session_timeline
        ├─► session_history
        │     ├─► kyc_test_report/{sessionId}
        │     └─► ai_review/{sessionId}
        └─► (return) dashboard
```

### 4.2 Session lifecycle

| State (`SessionState`) | Meaning |
|---|---|
| `IDLE` | No active workflow session |
| `ARMED` | Lab Host package/config ready (armed) |
| `RUNNING` | Operator progressing through workflow steps |
| `PAUSED` | Session held (if used by UI) |
| `ENDED` | Finalized; eligible for report / AI analysis |

**Typical transitions**

```text
IDLE → (arm Lab Host) → ARMED → (start workflow) → RUNNING → (end session) → ENDED
                              ↘ (disarm / clear media) → IDLE
```

### 4.3 Dashboard entry points

From the dashboard the operator chooses a **capability**, not only a workflow:

| Capability | Destination | Prerequisite |
|---|---|---|
| Media Engine | `media_engine` | Toolkit secret for generation |
| Arm Lab Host | `arming` | Media package or manual media load |
| Guided workflow | `workflow_selection` | Prefer arm first for KYC-style flows |
| Free browser | `chrome_browser` | Prefer arm first for substitution tests |
| Timeline | `session_timeline` | Active or recent events |
| History | `session_history` | Prior saved sessions |

---

## 5. Media Engine pipeline workflow

**Deep dive:** [MEDIA_GENERATION_WORKFLOWS.md](./MEDIA_GENERATION_WORKFLOWS.md) — stage-by-stage generation, prompts, hygiene, packaging, API contracts, and failure recovery.

**Code:** `PipelineOrchestrator`, `XaiMediaClient`, `MediaHygiene`, `KycPromptLibrary`  
**Screen:** `MediaEngineScreen`  
**Billing:** Rork Cloud Credits via Toolkit gateway (not direct provider keys by default).

### 5.1 Preconditions

1. `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY` (and optional URL) available at build time → `BuildConfig`.
2. Source **front** and **back** ID images set via `setSourceImages`.
3. Optional: enable expression packs (`SMILE_RAMP`, `CIRCULAR_360`, `LOOK_LR`).
4. Optional: toggle continuous video generation.

### 5.2 Pipeline stages (order)

```text
Source front ID ──┐
                  ├──► doc_front (image edit, 1920×1080)
Source back ID  ──┘
                       doc_back (image edit, 1920×1080)
                            │
                            ▼
                     wall_locked (T2I white wall plate, 1280×720)
                            │
              doc_front ────┤
              wall_locked ──┴──► face_still (multi-image edit composite)
                                      │
                                      ├──► face_continuous (I2V, optional)
                                      ├──► pack_smile_ramp (optional)
                                      ├──► pack_circular_360 (optional)
                                      └──► pack_look_lr (optional)
                                      │
                                      ▼
                              Media hygiene + packaging
                                      │
                                      ▼
                         filesDir/kyc_runs/run_*
                         + lab_host_package.json
```

| Step ID | Asset | Spec (from code) | API style |
|---|---|---|---|
| `doc_front` | Licence front | 1920×1080 PNG, 16:9 | Image edit from uploaded front |
| `doc_back` | Licence back | 1920×1080 PNG, 16:9 | Image edit from uploaded back |
| `wall_locked` | White wall plate | 1280×720 PNG | Text-to-image |
| `face_still` | Face still | 1280×720 PNG composite | Multi-image edit |
| `face_continuous` | Liveness loop | 1280×720 MP4 ~15s | Image-to-video |
| `pack_*` | Expression packs | I2V from face_still | Image-to-video |

### 5.3 Hygiene and packaging workflow

After generation, hygiene transforms assets toward phone-captured signatures:

1. **Compression signature** — JPEG re-encode + mild sensor noise (`MediaHygiene.reencodeJpeg`).
2. **EXIF restamp** — device fingerprint profile (make/model/lens/ISO timestamps).
3. **Video bitrate normalize** — best-effort; may copy original if transcode fails.
4. **Package write** under `filesDir/kyc_runs/run_*`:

| Artifact | Purpose |
|---|---|
| `doc_front.png`, `doc_back.png` | Document sequence slots |
| `wall_locked.png`, `face_still.png` | Face / wall plates |
| `face_continuous.mp4` | Silent-front liveness video |
| `jpeg_exif/` | JPEG EXIF twins |
| `frames/` | Extracted stills |
| `.meta.txt` sidecars | PNG metadata notes |
| `device_fingerprint.txt` | Human-readable profile |
| `manifest.json` | Run manifest + hygiene flags |
| `lab_host_package.json` | Armable package for Lab Host |

### 5.4 Operator procedure

```text
1. Open Media Engine
2. Confirm "AI ready" / toolkit configured
3. Import front + back source images
4. Select expression packs if needed
5. Init pipeline → Run pipeline
6. Wait for each step: PENDING → GENERATING → DONE | FAILED
7. On failure: read step errorMessage, fix sources/credits/network, re-run failed stage or full pipeline
8. On success: package is available for Arming
```

### 5.5 Fail-closed behaviors

- Missing toolkit credentials → chat/media clients return null / log error; pipeline steps fail.
- Missing `face_still` before video → video step errors explicitly.
- Empty media seed after package load → KYC readiness fails until media registered on bridge.

---

## 6. Lab Host arming workflow

**Code:** `LabHostArmingService`, `TakeoverInjectionBaseline`, `LabReadiness`, `LabMediaBridge`  
**Screen:** `ArmingScreen`

### 6.1 Baseline configuration

Device-verified baseline (`TakeoverInjectionBaseline`):

| Field | Baseline value |
|---|---|
| Device reference | SM-S931B (Galaxy S24 Ultra) |
| `cameraTakeoverEnabled` | `true` |
| `cameraInterceptPolicy` | **SUBSTITUTE** |
| `cameraTakeoverMode` | `USER_PICK` |
| `silentFrontEnabled` | `true` |
| `preferHtmlVideo` | `true` |
| `mediaUploadMode` | `USER_PICK` |
| `injectMode` | `CONTINUOUS_DEFAULT` |
| Techniques | `INJ-04`, `INJ-05`, `INJ-06`, `INJ-09`, `INJ-10`, `INJ-13` |

### 6.2 Arming procedure

```text
1. Load media into bridge
   - From Media Engine package (preferred), or
   - Manual import: sequence slots + silent passive + silent liveness
2. Review readiness chips (LabReadiness / missingForKyc)
3. Arm → writes BrowserHostConfig + registers bridge URLs
4. Reload KYC page after arm (checklist item)
5. Confirm media seed non-empty
```

### 6.3 KYC readiness formula

From `BrowserHostConfig.isKycReady`:

```text
cameraTakeoverEnabled
AND cameraInterceptPolicy == SUBSTITUTE
AND !mediaSeedEmpty
AND (silentFrontPassiveUrl != null OR silentFrontLivenessUrl != null)
```

`missingForKyc()` lists concrete blockers for the UI.

### 6.4 Media checklist (baseline)

1. PASSIVE still/clip loaded  
2. LIVENESS mp4 loaded  
3. Library docs loaded (front + back)  
4. KYC page reloaded after arm  

### 6.5 Media bridge model

Local files are served into HTTPS pages via synthetic host:

```text
https://cdn.assets.edge/seq/{slot}      → sequence assets
https://cdn.assets.edge/silent/{kind}   → silent front (passive | liveness)
https://cdn.assets.edge/inject/...      → inject helpers (e.g. Sumsub bootstrap)
https://cdn.assets.edge/t.gif?e=...     → telemetry pixel (observations)
```

WebView `shouldInterceptRequest` serves files with CORS headers so canvas/GUM pipelines can consume them.

### 6.6 Disarm / clear

`clearAll()` must wipe stores **and** slot/kind maps (`sequenceSlots`, `silentKinds`). After clear, re-arm is required before KYC-ready tests.

---

## 7. Bundled session workflows

**Code:** `model/Workflows.kt`  
**Screens:** `WorkflowSelectionScreen` → `WorkflowRunnerScreen`

All bundled workflows are **on-device** (no backend required to list/run them). AI can later **generate** additional provider-specific workflows saved under `filesDir/generated_workflows/`.

### 7.1 Full KYC Interaction Test

| | |
|---|---|
| **ID** | `full-kyc-interaction-test` |
| **Duration** | ~8 min |
| **Intent** | End-to-end provider flow with Lab Host armed; full traffic/capture/takeover recording |

| Step | ID | Camera | Upload | Operator focus |
|---|---|---|---|---|
| 1 | `readiness` | — | — | All readiness chips green; return to Arming/Media Engine if not |
| 2 | `launch-provider` | ✓ | — | Load provider; watch navigation, iframe, first GUM intercept |
| 3 | `doc-front` | ✓ | ✓ | File chooser / capture served from sequence; intercept on timeline |
| 4 | `doc-back` | ✓ | ✓ | Sequence cursor advances; different asset delivered |
| 5 | `liveness` | ✓ | — | Substituted stream; facing-mode switches; repeated GUM |
| 6 | `finalize` | — | — | End session → KYC Test Report → optional AI analysis |

Default lab page URLs in the bundle point at the hosted **BoundaryLab Range** (`https://boundarylab-range.rork.app/verify`) — operators can override with a third-party KYC provider URL from the workflow picker.

### 7.2 KYC Document Capture

| | |
|---|---|
| **ID** | `kyc-document-capture` |
| **Duration** | ~5 min |

| Step | ID | Focus |
|---|---|---|
| `intro` | Consent and document ready |
| `lighting-check` | Environment / lighting (`/env-check`) |
| `doc-front` | Front capture with framing guide |
| `doc-back` | Back capture |
| `review` | Operator + participant review |

### 7.3 Liveness Verification

| | |
|---|---|
| **ID** | `liveness-verification` |
| **Duration** | ~3 min |

| Step | ID | Focus |
|---|---|---|
| `intro` | Explain challenges |
| `face-center` | Face in oval guide |
| `head-turn` | Left/right turn |
| `expression` | Smile / neutral |
| `complete` | Confirm pass |

### 7.4 Device Integrity Scan

| | |
|---|---|
| **ID** | `device-integrity-scan` |
| **Duration** | ~4 min |

| Step | ID | Focus |
|---|---|---|
| `intro` | Asset verification briefing |
| `serial` | Serial number capture |
| `screen` | Screen condition |
| `housing` | Chassis angles |
| `finalize` | Review observations |

### 7.5 AI-generated workflows

After AI Review succeeds:

1. `SessionAnalyzer` returns profile + workflow JSON.  
2. Operator may **save** as `GeneratedWorkflow` → `filesDir/generated_workflows/{id}.json`.  
3. Saved workflows appear alongside bundled ones for re-run against the same provider class.

---

## 8. Browser capture / injection workflow

**Code:** `ChromeBrowserScreen`, `LabHostBrowser`, `LabHostWebViewClients`, `GumInjectRuntime`, `TechniqueInjectionScripts`, `CaptureInterceptResolver`, `MediaUploadHelper`, `DeviceSpoofer`, `SumsubFrameInjector`

### 8.1 Page load sequence

```text
WebView created
  → DeviceSpoofer.applyToWebView (UA + JS identity hooks)
  → loadUrl(target)
onPageStarted
  → GumInjectRuntime.injectBootstrap(config)
  → if Sumsub URL → injectIntoMainFrame
onPageFinished
  → reapplyEarlyLock or injectSumsubBootstrap
shouldInterceptRequest
  → telemetry pixel? → parse observation
  → bridge URL? → serve local file + CORS
  → Sumsub HTML? → CSP strip / inject path
onPermissionRequest
  → grant camera/mic per policy so page believes access succeeded under SUBSTITUTE
onShowFileChooser
  → CaptureInterceptResolver → Deliver | Park | Cancel
  → MediaUploadHelper completes ValueCallback with FileProvider URI
```

### 8.2 Camera intercept policies

| Policy | Behavior |
|---|---|
| `ALLOW` | Real camera passes through |
| `SUBSTITUTE` | Synthetic / lab media replaces camera stream |
| `DENY` | Camera requests denied |

### 8.3 Media upload modes (file chooser)

| Mode | Behavior |
|---|---|
| `SYSTEM_CHOOSER` | Normal Android picker |
| `GALLERY` / `CAMERA` | Constrained source |
| `LAB_SYNTHETIC` | Instant lab media, no UI |
| `USER_DEFINED` | Operator library only |
| `MEDIA_SEQUENCE` | Next absolute sequence slot |
| `USER_PICK` | Park until operator picks |
| `CANCEL` | Null callback |

### 8.4 Inject modes (front camera payload)

| Mode | Payload preference |
|---|---|
| `PASSIVE_FIRST` | Face still |
| `CONTINUOUS_DEFAULT` | Liveness video loop |
| `ACTIVE_ADVANCED` | Continuous + dynamic challenges |

### 8.5 Sequence cursor advancement

After a successful sequence delivery:

1. Native layer advances `mediaSeqIndex` (`advanceSequenceConfig`).  
2. JS runtime may advance Symbol-state sequence (`advanceSequence`).  
3. Next chooser/GUM delivery uses the next slot.

### 8.6 Manual inject

Operator can inject a specific `MediaSlotInfo` into the active WebView via `injectMediaSlot`:

- Only **bridge URLs** (`https://cdn.assets.edge/...`) are accepted.  
- URL is escaped for single-quoted JS embedding.  
- Uses `Symbol.for('__sc')` inject API when present; falls back to DOM `video`/`img` src.

### 8.7 Operator pick park/accept

When mode is `USER_PICK` / park resolution:

1. Capture parks; UI prompts operator.  
2. `acceptPendingPick` / `rejectPendingPick` resolve GUM or chooser.  
3. Event logged under permissions/uploads.

---

## 9. Session close, reports, and AI review

### 9.1 End session workflow

```text
RUNNING → endSession()
  → persist SavedSession (events, observations, config snapshot, timestamps)
  → navigate history / report
```

### 9.2 KYC Test Report (deterministic, offline)

**Code:** `KycTestAnalyzer`  
**Route:** `kyc_test_report/{sessionId}`

Always available without network. Computes:

| Section | Source |
|---|---|
| Checklist pass/warn/fail | Rules over observations + events |
| Traffic breakdown | fetch / websocket / webrtc / iframe / canvas / permission / navigation |
| Takeover counts | `gum` + `takeover` observations; facing:front/back |
| Capture breakdown | File chooser intercept modes |
| Unified activity feed | Chronological traffic + capture + takeover + system |

**Pass heuristic:** `allCriticalPassed` when no checklist item is `FAIL`.

### 9.3 AI Review workflow (optional, online)

**Code:** `SessionAnalyzer` + `XaiChatClient`  
**Route:** `ai_review/{sessionId}`  
**Model path:** Toolkit → chat completions (`xai/grok-4.3` class model id in client)

```text
1. Build system prompt (KYC flow analyst role)
2. Build user prompt from SavedSession JSON (events + observations + config + URL)
3. Progress: CONNECTING → ANALYZING → PARSING → DONE | ERROR
4. Parse structured JSON:
   - provider profile (hosts, image/liveness requirements, hidden requests, risks)
   - generated Workflow steps
5. Optionally save GeneratedWorkflow for re-use
```

**Failure paths**

| Condition | Result |
|---|---|
| Missing toolkit secret | Empty response → ERROR analysis with message |
| Network / HTTP error | ERROR; raw body if any |
| Malformed model JSON | ERROR with parse message; rawResponse retained |

---

## 10. Web Range workflows

**App:** `web-boundarylab-range`  
**Dev:** `bun run dev` (Vite, port **8080**, host `::`)  
**Test:** `bunx vitest run` · **Build:** `bun run build`

### 10.1 Route map

| Path | Role | Technique tag |
|---|---|---|
| `/` | Station hub | — |
| `/verify` | Full mock ID check | multi-surface target |
| `/verify/liveness-widget` | Isolated liveness iframe-style realm | INJ-05 |
| `/probes/display` | `getDisplayMedia` probe | INJ-06 |
| `/probes/fingerprint` | navigator / WebGL / devices | fingerprint |
| `/console` | Operator telemetry console | — |
| `/share/:id` | Shared report viewer | share |

### 10.2 Verification flow workflow (`/verify`)

```text
welcome (consent)
  → doc-front  (file chooser + object URL preview)
  → doc-back
  → liveness   (main-frame getUserMedia + StreamMonitor)
  → widget     (iframe liveness; postMessage complete)
  → result     (enumerateDevices + buildRangeReport)
```

**Scoring engine** (`buildRangeReport` in `detection.ts`):

| Check ID | Signal | Fail / warn criteria |
|---|---|---|
| `continuity` | `frozenMs` | Fail if > 300 ms frozen |
| `framerate` | `fps` | Fail if < 8; warn if < 15 |
| `variance` | inter-frame delta | Warn if < 0.4 |
| `track` | `deviceId` | Warn if missing |
| `timing` | GUM resolve ms | Warn if < 15 ms |
| `devices` | enumerateDevices | Warn if empty id/label |

**Verdict**

| Verdict | Rule (simplified) |
|---|---|
| `pending` | Stream inactive, no decisive checks |
| `spoofed` | Any fail |
| `suspicious` | More than one warn |
| `genuine` | Otherwise |

Score starts at 100; −35 per fail, −12 per warn (clamped 0–100).

### 10.3 Liveness widget workflow

1. Operator starts challenge.  
2. GUM resolves in iframe/path realm; events log as `gum-iframe`.  
3. Challenge sequence: center → smile → turn-left → turn-right → done (~2.2 s steps).  
4. Final report uses **latest signals ref** (not stale React state).  
5. `postMessage` to parent with `source: boundarylab-liveness-widget` targeting **same origin**.  
6. Cleanup stops tracks and clears intervals.

### 10.4 Operator console workflow

1. Subscribe to `rangeStore` (BroadcastChannel `boundarylab-range` + sessionStorage).  
2. Live metrics: fps, frozen, variance, event counts by surface.  
3. **Export JSON** → `buildSessionExport` + download.  
4. **Share Link** → `POST {FUNCTIONS_URL}/share` → copyable `/share/{id}`.  
5. **Reset** clears local session state across tabs.

### 10.5 Cross-tab telemetry workflow

```text
Tab A (/verify) ──log/setSignals/setReport──► RangeStore
                      │ broadcast + sessionStorage
Tab B (/console) ◄──── applyRemote ──────────┘
```

Max events retained: **200**.

---

## 11. Share / functions workflow

**Code:** `functions/index.ts`, `functions/shared-report.ts`  
**Client:** `shareReport.ts`, `shareId.ts`

### 11.1 Create share

```text
Client buildSessionExport(state)
  → POST /share  Content-Type: application/json
  → Worker validates JSON + size ≤ 1_000_000 bytes
  → randomShareId()  // 22-char base64url from 16 CSPRNG bytes
  → Durable Object PUT /store  (TTL 24h, alarm scrub)
  → { id, createdAt, expiresAt }
  → Client builds URL: origin/share/{id}
```

### 11.2 Fetch share

```text
GET /share/{id}
  → id must match new 22-char base64url OR legacy 16-char alnum
  → DO GET /fetch
  → 404 if missing/expired
  → { payload, createdAt, expiresAt }
```

### 11.3 Security properties (lab design)

| Control | Implementation |
|---|---|
| Unguessable id | 128 bits CSPRNG, unbiased encoding |
| TTL | 24 hours + DO alarm delete |
| Body cap | 1 MB worker + DO |
| CORS | `*` (lab handoff; residual public abuse risk) |
| Auth | None (intentionally open temporary store) |

### 11.4 Health

`GET /ping` → `{ ok: true, now: ISO }`.

---

## 12. Technique index (INJ-\*)

Techniques referenced in baseline config and Range UI:

| ID | Surface | Lab Host behavior | Range exercise |
|---|---|---|---|
| **INJ-04** | Main-frame GUM | Bootstrap hijacks `getUserMedia`; synthetic stream | `/verify` liveness |
| **INJ-05** | Iframe / widget GUM | Early lock + Sumsub path inject | `/verify` widget · `/verify/liveness-widget` |
| **INJ-06** | Display media | Technique set includes display path | `/probes/display` |
| **INJ-09** | Device / track identity | Spoof labels, track settings, enumerateDevices | Fingerprint probe + GUM |
| **INJ-10** | File chooser | Chooser intercept + sequence/lab media | `/verify` doc steps |
| **INJ-13** | Related inject stack | Included in baseline technique chip set | Combined flows |

Fingerprint probe additionally surfaces automation / WebView tells (`webdriver`, missing `window.chrome`, empty device labels).

---

## 13. Readiness gates and fail-closed rules

| Gate | Pass condition | Fail-closed action |
|---|---|---|
| Toolkit configured | URL + secret non-blank | Media/AI calls abort with logged error |
| Media seed | At least one silent or sequence asset | `mediaSeedEmpty=true`; KYC not ready |
| KYC ready | Takeover + SUBSTITUTE + seed + silent media | Block claim of armed KYC readiness |
| Sequence import | Stream non-null and file length > 0 | Import returns null; no empty registration |
| Inject media | Bridge URL only | Refuse inject; warning event |
| Share id | Charset/length valid | 400 invalid id; client throws `ShareError` |
| Share body | Valid JSON ≤ 1 MB | 400 / 413 |
| Share record | Not expired | 404 |

---

## 14. Build, verify, and audit workflows

### 14.1 Web Range

```bash
cd web-boundarylab-range
bun install
bun run dev          # http://localhost:8080
bun run lint
bunx tsc -p tsconfig.app.json --noEmit
bunx vitest run      # unit (detection, export, share-id)
bun run build
```

Optional browser tests: `bun run test:browser:run` (Playwright + vitest browser config).

**Env**

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_RORK_FUNCTIONS_URL` | Share backend base URL |
| Vite also accepts `VITE_*` via `envPrefix` | Local overrides |

### 14.2 Android Lab

```bash
cd android-boundarylab
# Requires Android SDK + JDK 17 (toolchain pins 17)
export JAVA_HOME=…/temurin-17.jdk/Contents/Home
# local.properties: sdk.dir=…
# .env or local.properties: toolkit URL/secret
./gradlew :app:assembleDebug
```

Credentials mapping (`app/build.gradle.kts`):

| Source key | BuildConfig field |
|---|---|
| `EXPO_PUBLIC_TOOLKIT_URL` / `RORK_TOOLKIT_URL` | `RORK_TOOLKIT_URL` |
| `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY` / `RORK_TOOLKIT_SECRET_KEY` | `RORK_TOOLKIT_SECRET_KEY` |
| `XAI_API_KEY` (legacy local) | `XAI_API_KEY` |
| `RUNWAY_API_KEY` (legacy local) | `RUNWAY_API_KEY` |

### 14.3 Functions

Deploy with the platform Worker/DO binding named for `SharedReport` and `DO` fetcher as used in `index.ts`. No npm runtime deps in `package.json` (Workers runtime APIs only).

### 14.4 Full codebase audit workflow

Documented in `AUDIT_NOTES.md` and skill `/full-codebase-audit`:

```text
Phase 1 Recon + baseline commands
Phase 2 Multi-vector audit (correctness, security, arch, perf, types, tests, ops)
Phase 3 Priority matrix P0–P3
Phase 4 Incremental repair
Phase 5 Test fortification
Phase 6 Final verification + executive summary
```

---

## 15. Operator checklists

### 15.1 Pre-flight (every lab day)

- [ ] Authorization / charter valid for today's targets  
- [ ] Range or target URL known and reachable  
- [ ] Toolkit credits available if generating media or AI review  
- [ ] Device on Java/SDK-built debug APK matching this tree  
- [ ] Camera + microphone permissions granted to BoundaryLab  
- [ ] No production customer PII unless authorized  

### 15.2 Full KYC interaction (Android + Range)

- [ ] Media Engine run completed; package on disk  
- [ ] Arming baseline applied; readiness green  
- [ ] Page reloaded after arm  
- [ ] Open Range `/verify` (or authorized provider) in Lab browser  
- [ ] Doc front intercept + sequence slot 1  
- [ ] Doc back intercept + sequence advance  
- [ ] Main-frame liveness GUM intercept under SUBSTITUTE  
- [ ] Widget/iframe GUM exercise  
- [ ] Timeline shows gum + capture + navigation  
- [ ] End session  
- [ ] KYC Test Report reviewed  
- [ ] Optional: AI Review + save generated workflow  
- [ ] Optional: Range console export / share  

### 15.3 Range-only anti-spoof baseline

- [ ] Two tabs: `/verify` + `/console`  
- [ ] Complete all verify steps with **real** camera  
- [ ] Expect `genuine` / high score  
- [ ] Reset; re-run under interception and compare verdict  

### 15.4 Share handoff

- [ ] Session has events  
- [ ] Backend URL configured  
- [ ] Share succeeds; id validates  
- [ ] Open `/share/:id` in clean browser  
- [ ] Link expires within 24h  

---

## 16. Failure modes and recovery

| Symptom | Likely cause | Recovery |
|---|---|---|
| Media Engine steps fail immediately | Missing toolkit secret / network | Set `.env` or `local.properties`, rebuild, check credits |
| KYC readiness never green | Empty seed or policy not SUBSTITUTE | Load silent media; re-arm baseline |
| GUM not intercepted | Takeover off / page loaded before inject | Enable takeover; hard reload after arm |
| File chooser real gallery | Upload mode SYSTEM_CHOOSER | Set USER_PICK / MEDIA_SEQUENCE / LAB_SYNTHETIC |
| Sumsub iframe still real camera | Bootstrap missed on iframe | Confirm Sumsub URL detection + inject path |
| Verdict always spoofed on Range | Frozen synthetic / low fps / no deviceId | Prefer continuous video; check track spoof; reduce freeze |
| Widget complete but parent stuck | postMessage origin mismatch | Same-origin embed; check listener source filter |
| Share upload fails | Missing `EXPO_PUBLIC_RORK_FUNCTIONS_URL` | Configure env; redeploy web |
| Share 400 invalid id | Malformed path | Use 22-char base64url or legacy 16-char alnum |
| Android build fails with `26` | Host JDK 26 | Use JDK 17; toolchain already set to 17 |
| Android SDK not found | No `sdk.dir` | Install SDK; write `local.properties` |
| Stale slots after clear | (fixed) maps not cleared | Update to post-audit `clearAll`; re-arm |

---

## 17. Data locations and artifacts

### Android (device)

| Path | Content |
|---|---|
| `cacheDir/lab_media/` | Imported sequence/silent files for bridge |
| `filesDir/kyc_runs/run_*` | Pipeline outputs + manifest + package |
| `filesDir/generated_workflows/` | AI-saved workflows JSON |
| Session storage (app private) | Saved sessions for history/report |

### Web (browser)

| Store | Content |
|---|---|
| `sessionStorage["boundarylab-range-events-v1"]` | Last ≤200 telemetry events |
| BroadcastChannel `boundarylab-range` | Cross-tab live sync |
| Download | `boundarylab-range_<slug>_<stamp>.json` |
| Share DO | One JSON blob per id, 24h |

### Repo (developer)

| Path | Content |
|---|---|
| `AUDIT_NOTES.md` | Last full audit matrix and verification |
| `WORKFLOWS.md` | This document |
| `rork.json` | App registry |

---

## 18. Glossary

| Term | Meaning |
|---|---|
| **Lab Host** | Instrumented WebView that intercepts capture APIs for the target page |
| **Range** | Mock KYC provider web app that scores streams |
| **Arming** | Applying `BrowserHostConfig` + media bridge registration |
| **SUBSTITUTE** | Camera policy that replaces real camera with lab media |
| **Silent front** | Dual passive still + liveness video for user-facing camera |
| **Media sequence** | Ordered assets for successive document captures |
| **Bridge URL** | `https://cdn.assets.edge/...` mapped to local files |
| **Observation** | Technical telemetry (GUM constraints, fetch, iframe, etc.) |
| **Timeline event** | Operator-visible session log entry |
| **KYC Test Report** | Offline deterministic checklist report |
| **AI Review** | Online LLM analysis of a saved session |
| **Session export** | Flattened JSON for AI/human review (web console) |

---

## Appendix A — Quick reference: preferred order of operations

```text
1. Media Engine  → generate package
2. Arming        → SUBSTITUTE baseline + readiness green
3. Browser       → open Range /verify (or authorized URL)
4. Drive flow    → docs → liveness → widget
5. Timeline      → confirm intercepts
6. End session   → save
7. KYC Report    → offline scorecard
8. AI Review     → optional deep profile
9. Console share → optional collaboration link
```

## Appendix B — Related source entry points

| Concern | Primary files |
|---|---|
| Navigation | `ui/navigation/AppNavigation.kt` |
| Session orchestration | `viewmodel/SessionViewModel.kt` |
| Bundled workflows | `model/Workflows.kt` |
| Arming | `capture/arming/LabHostArmingService.kt` |
| Baseline config | `capture/TakeoverInjectionBaseline.kt` |
| Inject scripts | `capture/TechniqueInjectionScripts.kt` |
| Pipeline | `mediaengine/PipelineOrchestrator.kt` |
| Offline report | `mediaengine/KycTestAnalyzer.kt` |
| AI analysis | `mediaengine/SessionAnalyzer.kt` |
| Range detection | `web-boundarylab-range/src/lib/detection.ts` |
| Range store | `web-boundarylab-range/src/lib/rangeStore.ts` |
| Share worker | `functions/index.ts`, `functions/shared-report.ts` |

---

*Document version: 2026-08-11 · Aligned with post-audit tree (share-id format, Config-free BuildConfig credentials, clearAll map hygiene, stream cleanup on Range).*
