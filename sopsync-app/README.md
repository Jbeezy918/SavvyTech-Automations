# SOPsync

**Approved process-capture, workflow-audit, training, and process-improvement desktop application for SavvyTech Automations.**

SOPsync observes how an authorized employee performs a business process, captures
visual evidence of each meaningful action, reconstructs the workflow, compares it
against an approved SOP, measures timing, surfaces evidence-linked deviations and
recommendations, and turns validated workflows into training material.

> This is **approved process capture, not surveillance.** Every capture session
> requires authorization, shows a visible recording indicator, offers
> pause/resume/stop, excludes configured apps/sites, and **never stores keystroke
> characters, passwords, or clipboard contents.**

---

## ⚠️ Build status & honest scope

This repository is a **cohesive, tested foundation** delivered in one pass, not a
finished 24-subsystem product. What is **implemented and tested** vs. what
**requires a Mac to finish/verify** is tracked precisely in
[`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) and
[`docs/IMPLEMENTATION_CHECKLIST.md`](docs/IMPLEMENTATION_CHECKLIST.md).

**Working and covered by the automated test suite (45 tests, all passing):**

- Capture-session state machine — start/pause/resume/stop, active-time accounting
  (excludes paused), crash recovery, screenshot-trigger rules, and the privacy
  guard that strips keystroke characters and unauthorized window titles.
- Evidence pipeline — sequential numbering (`001`, `002`, …), SHA-256 hashing,
  immutable originals, transaction-safe writes (verified crash-safe).
- Perceptual-hash near-duplicate detection & clustering.
- Sensitive-data detection (email, SSN, Luhn-validated cards, phone, medical).
- SOP ingestion parser (metadata, sections, numbered steps, warnings, decisions).
- Workflow-vs-SOP comparison (completed / skipped / repeated / undocumented /
  out-of-order) with evidence links and a compliance score.
- Timing analysis (active/idle/rework/app-switch, bottlenecks, execution stats).
- Evidence-based recommendations (estimates clearly labeled; no fabricated dollars).
- Deterministic workflow proposal (human-approval-gated).
- Report generation (JSON / HTML / CSV) — a real sample package is in
  [`sample-data/`](sample-data/).
- Encryption (AES-256-GCM) round-trip and evidence hashing.

**Written, type-checked, and builds — but needs macOS to run/verify:**

- Electron app shell, menu-bar tray, dashboard UI, onboarding wizard.
- SQLCipher encrypted database + repositories.
- macOS screen capture (`screencapture`), Keychain (`keytar`), `sharp` hashing.
- Global input hooks (click/keystroke *event* triggers) — see Known Limitations.
- Packaging/signing/notarization.

Nothing here claims to work that has not been implemented; features requiring a
Mac are labeled as such rather than asserted.

---

## Quick start (on macOS)

```bash
cd sopsync-app
npm install            # builds native modules (better-sqlite3, sharp, keytar)
npm test               # run the 45-test suite (works on any platform)
npm start              # build + launch the Electron app
npm run package:mac    # produce a signed .app / .dmg (needs Apple signing setup)
```

On any platform you can run the pure-logic pipeline and regenerate the sample
audit package without native modules:

```bash
npm install --ignore-scripts
npm test
npx tsx scripts/generate-sample.ts   # writes sample-data/sample-report.{html,json}
```

## Documentation

| Guide | File |
|-------|------|
| Architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Requirements spec | [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) |
| Implementation checklist | [docs/IMPLEMENTATION_CHECKLIST.md](docs/IMPLEMENTATION_CHECKLIST.md) |
| Installation | [docs/INSTALL.md](docs/INSTALL.md) |
| Uninstallation | [docs/UNINSTALL.md](docs/UNINSTALL.md) |
| Configuration | [docs/CONFIGURATION.md](docs/CONFIGURATION.md) |
| Privacy & security | [docs/PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md) |
| Backup & recovery | [docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md) |
| Known limitations | [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) |
| Test results | [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) |

## Moving this into a standalone `SOP_Sync` repo

This app lives in `sopsync-app/` inside `SavvyTech-Automations`. To split it into
its own repo with history preserved:

```bash
# create an empty SOP_Sync repo on GitHub first, then:
git subtree split --prefix=sopsync-app -b sopsync-only
git push git@github.com:Jbeezy918/SOP_Sync.git sopsync-only:main
```

## License

UNLICENSED — © SavvyTech Automations. Internal use.
