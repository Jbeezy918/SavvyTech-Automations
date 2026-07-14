# Configuration Guide

## Data locations
All under `~/Library/Application Support/SOPsync/`:

| Path | Contents |
|------|----------|
| `sopsync.db` | Encrypted SQLCipher database |
| `evidence/<sessionId>/` | Immutable original screenshots (`001.png`, …) |
| `derived/<sessionId>/` | Redacted / cropped / annotated derived images |
| `backups/` | Database backups (`sopsync-<timestamp>.db`) |
| `logs/` | Plain-language logs |
| `config.json` | Non-secret configuration |

Secrets (DB key, AI keys) live in the **macOS Keychain**, never in these files.

## Capture configuration (per session)
Set in the Capture view before starting:

| Setting | Meaning |
|---------|---------|
| Monitor | Which display to capture |
| Included / excluded apps | Allow-list / block-list (block-list wins) |
| Excluded URL patterns | Sites never captured |
| Capture on click / nav-key / app-change / window-change | Screenshot triggers |
| Timed interval | Periodic capture (seconds; 0 = off) |
| Authorize window titles | Store window titles for this session |
| Duplicate similarity threshold | 0–1; higher = stricter dedup |
| Redaction | Auto-detect kinds; suggest vs. auto-apply masks |

Defaults exclude `1Password` and `Keychain Access`, keep window titles **off**,
and only **suggest** redactions.

## AI providers
Settings → AI provider: `none` (default, offline & deterministic), `local`,
`openai`, or `anthropic`. Selecting an external provider requires entering an API
key, which is stored in the Keychain. **No data leaves the machine unless an
external provider is explicitly selected and authorized.**

## Voice
Global **Voice Enabled** switch (off by default). Push-to-talk by default;
spoken announcements never occur unless explicitly enabled.

## Roles & permissions
Nine roles from `system_administrator` to `read_only_reviewer`
(`src/shared/roles.ts`). Permissions are enforced in the main process. For the MVP
the operator runs as `system_administrator` after first-run setup.

## Retention
Per-client retention policies (retain days, auto-delete originals/derived) are
modeled in `retention_policies`. Configure per client; deletion honors the policy.
