# Test Results

Run: `npm test` (Vitest). Platform-independent — no native modules required.

```
Test Files  9 passed (9)
     Tests  45 passed (45)
```

## Coverage by critical behavior (spec section 23)

| Area | File | Key assertions |
|------|------|----------------|
| **Capture** | `test/sessionMachine.test.ts` (8) | legal transitions; paused time excluded from active elapsed; capture suppressed while paused; `navKey` stored only for nav events; window titles withheld unless authorized; trigger + app-exclusion rules; crash recovery; zero-padded numbers |
| **Capture pipeline** | `test/captureService.test.ts` (5) | sequential numbering + SHA-256; no raw characters ever recorded; excluded-app + paused suppression; every write inside a transaction; **originals never overwritten** |
| **Storage / crypto** | `test/crypto.test.ts` (4) | AES-256-GCM round-trip; wrong-passphrase fails; stable evidence hash; DB key format |
| **Privacy** | `test/redaction.test.ts` (4) | Luhn card validation; email/SSN/phone/card detection; invalid digit runs rejected; only enabled kinds reported; invalid SSN rejected |
| **Dedup** | `test/duplicates.test.ts` (4) | dHash determinism; hamming/similarity; near-duplicate clustering keeps distinct screens apart; sequential similarity |
| **Comparison** | `test/comparison.test.ts` (5) | completed + evidence links; skipped; undocumented + repeated; **out-of-order**; every finding non-vague & evidence-referencing |
| **Timing** | `test/timing.test.ts` (4) | per-step attribution; active vs idle split; bottleneck detection; fastest/slowest/median/average; high-variation steps |
| **Recommendations / roles / proposal / reports** | `test/misc.test.ts` (11) | RBAC grants/denies; workflow proposal splits on app change & flags low-confidence for review; no step without evidence; evidence-based rules; labor savings only with a rate; JSON/CSV/HTML reports with escaped cells & labeled estimates |

## Integration smoke (sample package)

`npx tsx scripts/generate-sample.ts` runs SOP-ingest → compare → timing →
recommendations → reports and writes `sample-data/sample-report.{html,json}` +
`sample-findings.csv`. Result on the bundled sample:

```
Sample audit generated: compliance 60%, 2 findings, 3 recommendations.
```

(The sample employee skipped the second-approval decision and repeated the
"enter refund" step; 85s of idle time was measured and surfaced as a
recommendation.)

## Type checking

```
npx tsc -p tsconfig.main.json --noEmit     # main process — clean
npx tsc -p tsconfig.renderer.json --noEmit # renderer — clean
npm run build:renderer                      # Vite bundle — 37 modules, built
```

## Not yet automated
See `docs/KNOWN_LIMITATIONS.md` — native/OS paths (screen capture, Keychain,
SQLCipher, global input hooks, packaging) are verified manually on macOS.
