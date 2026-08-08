# SOPsync Architecture

## Overview

SOPsync is a **local-first, modular Electron desktop application**. All data stays
on the operator's Mac in an encrypted database and an encrypted evidence folder.
Nothing is uploaded without explicit authorization.

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer (React, sandboxed — no Node access)                  │
│  Dashboard · Onboarding · Capture · Review Board · Health     │
└───────────────▲───────────────────────────────────────────────┘
                │ contextBridge (typed, permission-checked IPC)
┌───────────────┴───────────────────────────────────────────────┐
│ Main process (Node/Electron)                                   │
│  AppContext ── boot, crash recovery, watchdog                  │
│  IPC handlers ── RBAC enforced here (not just in the UI)       │
│  CaptureService ── serialized event/screenshot pipeline        │
│  Analysis ── duplicates · proposal · comparison · timing · recs│
│  Reports ── JSON / HTML / CSV                                  │
│  Security ── crypto (AES-GCM) · Keychain · redaction           │
│  DB ── SQLCipher (encrypted) via transaction-safe repositories │
└───────────────▲───────────────────────────────────────────────┘
                │
┌───────────────┴───────────────────────────────────────────────┐
│ OS backends                                                    │
│  screencapture (screen) · uiohook-style input categories only  │
│  Keychain (secrets) · sharp (image hashing)                    │
└────────────────────────────────────────────────────────────────┘
```

## Process boundaries & security

- **contextIsolation on, nodeIntegration off, sandbox on.** The renderer can only
  call the explicit methods exposed by `src/preload/preload.ts`.
- **RBAC is enforced in the main process** (`src/main/ipc.ts` → `can(role, perm)`),
  so hiding a button is never the only guard.
- **Secrets never touch disk** — the DB key and any AI provider keys live in the
  macOS Keychain (`src/main/security/keychain.ts`).

## Evidence integrity

- Every screenshot original is written **once**, hashed with SHA-256, and its DB
  row references that immutable file. `updateScreenshotMeta()` deliberately cannot
  change `original_path`/`original_sha256`.
- Redaction, cropping, and annotation create **derived** images; originals are
  preserved (`DerivedImage[]`).
- Screenshots are numbered sequentially per session (`001`, `002`, …), enforced by
  a `UNIQUE(session_id, number)` constraint.

## Reliability

- **Transaction-safe writes:** each event (+ its screenshot) is committed in one
  `better-sqlite3` transaction; a crash mid-write rolls back cleanly.
- **Crash recovery:** on boot, sessions left `running`/`paused` are marked
  `recovered` with all evidence intact (`AppContext.recoverInterruptedSessions`).
- **Watchdog:** periodic health checks restart unhealthy internal services without
  interrupting an active capture (`src/main/watchdog.ts`).
- **Serialized capture queue:** input signals and pause/resume/stop flow through a
  single promise chain so chronological order is exact and no input races are lost.

## Testability

OS- and native-dependent pieces sit behind narrow interfaces
(`ScreenBackend`, `InputBackend`, `GrayscaleSampler`, `SecretStore`, `CaptureStore`)
so the analysis, capture-orchestration, privacy, timing, and report logic are
unit-tested on any platform with injected fakes. See `test/`.

## Provider abstraction (AI)

Analysis is **deterministic by default** (no external calls). External LLM
providers are optional, selected in Settings, and gated: screenshots/business data
are never sent to a provider unless the user selects and authorizes it. Keys come
from the Keychain. The provider layer is an interface so models can be swapped.

## Directory layout

```
src/
  shared/     types, ipc contract, roles, ids  (used by main + renderer)
  main/
    app/      paths, AppContext (boot/recovery/backup)
    capture/  sessionMachine, captureService, backends, sharpSampler
    db/       schema, database (SQLCipher), repositories
    security/ crypto, keychain, redaction
    analysis/ duplicates, workflowProposal, comparison, timing,
              recommendations, sessionAnalysis
    reports/  reports (json/html/csv)
    logging/  logger
    watchdog.ts
    ipc.ts, main.ts
  preload/    preload.ts (contextBridge)
  renderer/   React dashboard, views, components
test/         vitest suites
scripts/      generate-sample.ts
sample-data/  sample SOP + generated sample report package
```
