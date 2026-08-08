# Known Limitations

Honest status of every area, so nothing is assumed to work that has not been
verified. "Tested" = covered by the automated suite. "Needs Mac" = written and
type-checks but requires macOS (native modules / OS permissions) to run.

## Tested on any platform
- Capture state machine, active-time accounting, crash recovery, trigger rules,
  privacy guard (no keystroke chars, window-title authorization).
- Evidence pipeline: sequential numbering, SHA-256, immutable originals,
  transaction-safe writes (a fake store asserts every write is inside a tx).
- Perceptual-hash dedup/clustering, sensitive-data detection (Luhn cards, SSN,
  email, phone, medical), SOP parser, comparison, timing, recommendations,
  workflow proposal, AES-256-GCM crypto, report generation (JSON/HTML/CSV).

## Needs a Mac to run / verify
- **Global input hooks.** Click/keystroke *event* triggers require a native
  global-hook module (e.g. `uiohook-napi`). It is wired behind `InputBackend`;
  the shipped `NullInputBackend` supports **manual** and **timed** capture only.
  When adding the native hook, configure it to emit **event categories only** —
  never key characters — to preserve the no-keylogger guarantee. Requires macOS
  Accessibility permission.
- **Screen capture.** Uses macOS `screencapture`; requires Screen Recording
  permission (TCC). Not exercisable on Linux/CI.
- **SQLCipher database.** `better-sqlite3-multiple-ciphers` is a native module;
  the DB layer is written and type-checks but is run/verified on a Mac.
- **Keychain.** `keytar` is native; on non-macOS the app falls back to an
  in-memory store and the UI shows a prominent "non-secure mode" warning.
- **Perceptual hashing at capture time.** Uses `sharp` (native) via
  `SharpSampler`; the hashing math is tested with injected samples.
- **Packaging / signing / notarization.** `electron-builder` config is present;
  producing a signed `.app`/`.dmg` needs an Apple Developer ID on a Mac.

## Not yet implemented (scaffolding / follow-up)
- Screen-state classification (`empty_form`/`partial`/`completed`) is currently a
  default; the review board lets a human set it. Automatic classification is a
  follow-up (heuristic or optional vision model).
- Full review-board editing (drag-reorder, arrows/boxes, merge/split groups,
  side-by-side) — data model supports it; the UI ships a read/organize board.
- SOP import from PDF/DOCX/image — the **parser** is done and tested; binary
  text-extraction adapters (pdf/docx/OCR) are follow-ups feeding the same parser.
- Multi-user auth/login — RBAC is enforced at the IPC layer with a single
  operator role for the MVP; per-user sessions are a follow-up.
- Voice controls, interactive training assistant, PDF/DOCX/XLSX export, and the
  cross-client learning/memory store are designed in the data model and specced
  but not built in this pass.
- OCR-driven auto-redaction masks are suggested from detected spans; drawing the
  mask onto a derived image is wired to `sharp` and needs a Mac to verify.

See `docs/IMPLEMENTATION_CHECKLIST.md` for the full spec-section-by-section map.
