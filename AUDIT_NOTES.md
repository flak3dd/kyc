# Full Codebase Audit — BoundaryLab / rork-ikycu

**Date:** 2026-08-11  
**Scope:** `android-boundarylab` (Kotlin/Compose), `web-boundarylab-range` (Vite/React), `functions` (Cloudflare Worker + DO)

## Repository map

| App | Stack | Entry points |
|---|---|---|
| android-boundarylab | Kotlin 2.0, AGP 8.7, Compose, Ktor, Coil, Koin | `MainActivity`, Lab Host / Chrome WebView hosts, Media Engine pipeline |
| web-boundarylab-range | React 19, Vite 8, Vitest, Tailwind, Zod | `/verify`, `/console`, `/share/:id`, probes |
| functions | Cloudflare Worker + Durable Object | `POST/GET /share`, `GET /ping` |

## Baseline results

| Command | Exit | Notes |
|---|---|---|
| `bun install` (web) | 0 | Clean install |
| `bun run lint` | 0 | 9 warnings (shadcn + unused eslint-disable) |
| `tsc -p tsconfig.app.json --noEmit` | 0 | `strict: false` |
| `vitest run` | 0 | 1 placeholder test only |
| `bun run build` | 0 | Production build OK |
| `./gradlew :app:assembleDebug` (Java 26 default) | 1 | Fails: unsupported JDK “26” |
| `./gradlew :app:compileDebugKotlin` (Java 17) | 1 | SDK location not found (no Android SDK on host) |

Unrelated user state: only untracked `.agents/` (preserved).

---

## Priority matrix

### P0 — Build / compile blockers

| ID | Finding | Evidence | Remediation | Validation |
|---|---|---|---|---|
| P0-1 | `Config` class missing (gitignored `Config.kt`) but imported by media clients | `XaiChatClient.kt`, `XaiMediaClient.kt`; `.gitignore` ignores `Config.kt` | Drop `Config` fallback; resolve credentials only via `BuildConfig` | Kotlin compile when SDK available |
| P0-2 | Gradle fails on system Java 26 | Error message literally `26` with Oracle JDK 26 default | Pin JVM toolchain 17 in Android modules + document | `JAVA_HOME=…/temurin-17` + SDK |

### P1 — Correctness / security / reliability

| ID | Finding | Evidence | Remediation | Validation |
|---|---|---|---|---|
| P1-1 | Share ID uses `byte % 62` (modulo bias) | `functions/index.ts` `randomShareId` | Unbiased base64url / hex encoding of CSPRNG bytes | Unit-level review + manual |
| P1-2 | Share GET accepts arbitrary DO id strings | `url.pathname.slice` with no charset check | Restrict id charset/length | Code review |
| P1-3 | `LabMediaBridge.clearAll()` leaves `sequenceSlots` / `silentKinds` | Maps written but never cleared | Clear both maps | Code review |
| P1-4 | Toolkit secret baked into `BuildConfig` for release + debug signing | `app/build.gradle.kts` release uses debug signing | Keep BuildConfig for lab, document residual risk; ensure empty default when unset; do not log secret | Residual (platform design) |
| P1-5 | MediaStream tracks not stopped on unmount (Verify / LivenessWidget) | Cleanup only stops monitor | Stop tracks + clear `srcObject` | Manual + code |
| P1-6 | Object URLs from document upload never revoked | `Verify.tsx` DocumentUpload | Revoke previous URL on replace/unmount | Code |
| P1-7 | Unauthenticated public share store + `CORS *` | Intentional for lab; storage abuse risk | Size cap already exists; id hardening; residual: rate limit needs platform | Residual |

### P2 — Tests, types, maintainability

| ID | Finding | Evidence | Remediation | Validation |
|---|---|---|---|---|
| P2-1 | Placeholder unit test only | `example.test.ts` | Real tests for `buildRangeReport`, `buildSessionExport`, share id validation helpers | `vitest run` |
| P2-2 | LivenessWidget `finish()` closes over stale `signals` | `finish` uses `signals` from render | Keep latest signals in ref | Code |
| P2-3 | `postMessage(..., "*")` | LivenessWidget | Use `window.location.origin` when same-origin embed | Code |
| P2-4 | TS `strict: false` | tsconfig.app.json | Enable stricter flags incrementally where safe | `tsc` |
| P2-5 | Unused eslint-disable directives | FingerprintProbe, LivenessWidget | Remove | lint |
| P2-6 | `importSequenceFromUri` can register empty file if stream null | LabMediaBridge | Fail closed when input stream missing | Code |

### P3 — Cleanup / DX

| ID | Finding | Remediation |
|---|---|---|
| P3-1 | shadcn react-refresh warnings | Leave (upstream pattern) or suppress in eslint for `components/ui` |
| P3-2 | browserslist stale warning | Optional db update |
| P3-3 | `allowBackup=true` on lab app with media | Set `allowBackup=false` for lab OPSEC |
| P3-4 | No README / SDK bootstrap docs | Add short CONTRIBUTING build notes in audit residual |

---

## Execution order

1. Android: remove Config dependency; clearAll fix; import null-stream; toolchain 17; allowBackup  
2. Functions: share id + validation  
3. Web: stream/object-url leaks; liveness signals ref; postMessage origin; tests; lint directives  
4. Full web verify suite  

## Applied changes (this audit)

| Priority | Change | Paths |
|---|---|---|
| P0 | Remove gitignored `Config` compile dependency | `XaiChatClient.kt`, `XaiMediaClient.kt` |
| P0 | JVM toolchain 17 + Java 17 compile options | `app/build.gradle.kts`, `gradle.properties` |
| P1 | Unbiased share ids + charset validation (legacy 16-char still accepted) | `functions/index.ts`, `shareId.ts`, `shareReport.ts` |
| P1 | `clearAll` clears slot/kind maps; fail-closed empty imports | `LabMediaBridge.kt` |
| P1 | Bridge-URL-only inject + JS string escape | `SessionViewModel.kt` |
| P1 | Stop MediaStream tracks / revoke object URLs | `Verify.tsx`, `LivenessWidget.tsx` |
| P2 | Fresh signals via ref; `postMessage` target origin | `LivenessWidget.tsx` |
| P2 | Real unit tests (8) for detection/export/share-id | `detection-export.test.ts` |
| P3 | `allowBackup=false`; eslint silence for shadcn ui | `AndroidManifest.xml`, `eslint.config.js` |

## Final verification (audit host)

| Command | Exit |
|---|---|
| `bun run lint` | 0 (0 errors, 0 warnings) |
| `bunx tsc -p tsconfig.app.json --noEmit` | 0 |
| `bunx vitest run` | 0 (8 tests) |
| `bun run build` | 0 |
| `JAVA_HOME=temurin-17 ./gradlew help` | 0 |
| `./gradlew :app:assembleDebug` | Blocked: no Android SDK |

## Environment constraints

- **No Android SDK** on audit host → cannot prove APK assemble; Android fixes are static/correctness.  
- **No Cloudflare deploy** → Worker changes not live-tested against Durable Objects.  
- Lab features that intercept KYC capture surfaces are **intentional** for authorized boundary testing; audit does **not** remove those capabilities.
