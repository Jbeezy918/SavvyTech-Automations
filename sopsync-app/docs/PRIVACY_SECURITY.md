# Privacy & Security Guide

SOPsync is **approved process capture, not surveillance.** These controls are
requirements, not options.

## What is never captured or stored
- **Keystroke characters** — the input layer emits event *categories* only
  (click, key-activity, app/window change) and a coarse navigation key
  (`enter`/`tab`/`escape`/`arrow`/…). There is no code path that records the
  character a user typed. Enforced by the `RawInput`/`InputSignal` types and
  verified in `test/sessionMachine.test.ts` and `test/captureService.test.ts`.
- **Passwords, clipboard contents, raw keystroke values.**
- **Window titles** — withheld unless the operator explicitly authorizes
  capturing them for the session (`captureWindowTitles`).

## Consent & visibility
- A capture session requires selecting a client, process, and participant, and
  starting it deliberately.
- A **visible recording indicator** is shown at all times (banner + menu-bar
  tray tooltip + animated dot).
- **Start / Pause / Resume / Stop** are always available; pausing immediately
  suppresses all capture.
- **Excluded applications and URL patterns** are never captured (e.g. password
  managers are excluded by default).

## Sensitive data handling
- Automatic detection of email, SSN, Luhn-validated card numbers, phone numbers,
  and medical terms over authorized text (never over raw keystrokes).
- Detected regions are **suggested** for masking by default; masks are applied to
  **derived** images only — originals are preserved as immutable evidence.
- Password fields are auto-masked when technically detectable.

## Encryption & secrets
- The database is encrypted at rest with **SQLCipher**.
- Evidence files can be encrypted with **AES-256-GCM** (`src/main/security/crypto.ts`).
- The database key and any AI-provider keys are stored in the **macOS Keychain** —
  never on disk, never in the repo. API keys are never hard-coded.

## Data boundaries
- **Local-first.** No cloud upload without explicit user approval.
- **No external LLM** receives screenshots or business data unless the user has
  selected and authorized that provider in Settings. Default analysis is fully
  deterministic and offline.
- **Multi-tenant isolation.** Every entity carries `organization_id`/`client_id`;
  one client's data is never mixed with another's.

## Access control
- Role-based permissions (9 roles) are **enforced in the main process** at the IPC
  boundary, not merely hidden in the UI.

## Audit & retention
- All privileged actions and errors are logged in plain language (System Health).
- Configurable retention policies per client; records can be corrected or deleted.
- Export history is recorded with SHA-256 of each exported artifact.

## Reporting a concern
Contact the SavvyTech administrator configured during setup.
