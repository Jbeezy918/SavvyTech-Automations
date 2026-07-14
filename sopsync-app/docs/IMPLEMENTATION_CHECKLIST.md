# Implementation Checklist (by spec section)

Legend: ✅ implemented + tested · 🟢 implemented, needs macOS to run · 🟡 partial /
scaffolded · ⬜ designed, not built this pass.

| # | Spec area | Status | Where |
|---|-----------|--------|-------|
| 1 | Product purpose | ✅ | analysis + reports pipeline |
| 2 | Privacy & security rules | ✅ | `security/`, `sessionMachine`, tests |
| 3 | Desktop app (launcher, tray, service, DB, recovery, watchdog) | 🟢 | `main.ts`, `context.ts`, `watchdog.ts` (run on Mac) |
| 4 | Main dashboard sections | 🟡 | `renderer/` (Dashboard, Capture, Review, Health, About shipped; others follow) |
| 5 | Capture session | ✅ | `captureService`, `sessionMachine` |
| 6 | Screenshot capture logic + metadata + numbering | ✅ | `captureService`, `Screenshot` type |
| 7 | Screenshot review board | 🟡 | `ReviewBoard.tsx` (view/organize; full editing follows) |
| 8 | AI screenshot organization (proposal) | ✅ | `workflowProposal.ts` (human-approval gated) |
| 9 | SOP ingestion | ✅/🟡 | parser ✅ (`sop/ingest.ts`); PDF/DOCX/OCR adapters ⬜ |
| 10 | Workflow comparison | ✅ | `comparison.ts` |
| 11 | Timing & process analysis | ✅ | `timing.ts` |
| 12 | Recommendations engine | ✅ | `recommendations.ts` |
| 13 | Learning & memory | ⬜ | data model isolates org/client; store follows |
| 14 | Interactive training assistant | ⬜ | entities modeled |
| 15 | Voice controls | ⬜ | switch + settings modeled |
| 16 | Reports & exports | ✅/🟡 | JSON/HTML/CSV ✅; PDF/DOCX/XLSX/ZIP follow |
| 17 | Consultant review package | 🟡 | report + evidence refs; ZIP packaging follows |
| 18 | Reliability | ✅/🟢 | tx-safe writes ✅, recovery ✅, watchdog 🟢, backup 🟢 |
| 19 | Technical architecture | 🟢 | `docs/ARCHITECTURE.md` |
| 20 | Data entities (all 26) | ✅ | `shared/types.ts`, `db/schema.ts` |
| 21 | User roles (9) | ✅ | `roles.ts`, enforced in `ipc.ts` |
| 22 | Initial setup experience | 🟢 | `OnboardingWizard.tsx` |
| 23 | Build requirements (plan, structure, tests) | ✅ | this repo + `test/` |
| 24 | Final product standard | 🟡 | core loop end-to-end; polish follows |

## Definition of done for the core loop (this pass)
- [x] Create a session with client/process/participant and privacy config
- [x] Start/pause/resume/stop with visible indicator (state machine + UI)
- [x] Numbered screenshots (`001`…) with full metadata, immutable originals
- [x] No keystroke characters ever stored (tested)
- [x] Near-duplicate detection & clustering (tested)
- [x] AI-proposed workflow, human-approval gated (tested)
- [x] Compare to SOP → evidence-linked findings + compliance score (tested)
- [x] Timing (active/idle/rework/bottlenecks) (tested)
- [x] Evidence-based recommendations, estimates labeled (tested)
- [x] Export JSON/HTML/CSV report (tested; sample generated)
- [x] Crash recovery + transaction-safe storage (tested)
- [x] RBAC enforced in main process (tested)

## Next milestones
1. Native input-hook module (event-category only) + on-Mac capture verification.
2. Full review-board editing (drag/merge/split/annotate) + screen-state classifier.
3. PDF/DOCX/XLSX export + ZIP evidence package + consultant transfer.
4. SOP binary extractors (PDF/DOCX/OCR).
5. Training assistant, voice controls, cross-client learning store.
6. Multi-user auth.
