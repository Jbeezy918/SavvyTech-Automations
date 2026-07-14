# Installation

## Requirements
- macOS 12+ (Apple Silicon or Intel)
- Node.js 20+ and npm (for building from source)
- Xcode Command Line Tools (`xcode-select --install`) for native modules

## Build & run from source
```bash
cd sopsync-app
npm install          # compiles better-sqlite3-multiple-ciphers, sharp, keytar
npm test             # optional: run the test suite
npm start            # builds main + renderer and launches SOPsync
```

## Produce a packaged app
```bash
npm run package:mac  # electron-builder → release/SOPsync-<version>.dmg and .app
```
Code signing & notarization require an Apple Developer ID. Set the standard
`electron-builder` env vars (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) before packaging. Without them you
get an unsigned build for local testing only.

## First launch — grant macOS permissions
SOPsync will request these the first time they are needed:
1. **Screen Recording** — System Settings → Privacy & Security → Screen Recording
   → enable SOPsync. Required for screenshots.
2. **Accessibility** — required only if the native input-hook module is installed
   (for click/keystroke *event* triggers). Manual + timed capture work without it.
3. **Microphone** — only if you enable voice notes.

Then the onboarding wizard guides you through creating the administrator,
organization, first client, AI/voice preferences, and privacy review.

## Install location & data
The packaged app installs to `/Applications/SOPsync.app`. All data lives under
`~/Library/Application Support/SOPsync/` (see `docs/CONFIGURATION.md`).
