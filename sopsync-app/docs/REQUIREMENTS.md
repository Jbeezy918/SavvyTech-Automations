# SOPsync Requirements Specification

## 1. Purpose
Observe an authorized employee performing a business process, capture visual
evidence, reconstruct the workflow, compare it to an approved SOP, measure timing,
surface evidence-linked deviations and recommendations, and produce training
material and reports. Approved process capture — not surveillance.

## 2. Non-functional requirements
- **Privacy:** no keystroke characters, passwords, or clipboard contents stored;
  visible recording indicator; start/pause/resume/stop; excluded apps/sites;
  sensitive-data detection; local encrypted storage; RBAC; audit logs;
  configurable retention; no cloud/LLM without explicit authorization.
- **Reliability:** autosave, crash recovery, transaction-safe writes, watchdog,
  duplicate-file prevention, structured logs, backup/restore, export verification.
- **Evidence integrity:** immutable originals, sequential numbering, SHA-256 per
  original, derived versions for all edits.
- **Local-first & modular:** encrypted local DB, provider-abstracted AI, testable
  components, clear install/update.

## 3. Functional requirements (summary)
1. Manage organizations, clients, departments, processes, SOPs, users/roles.
2. Create capture sessions with full privacy config.
3. Capture screenshots on meaningful triggers with complete metadata.
4. Detect near-duplicates and cluster them.
5. Propose a workflow from evidence (human approval required).
6. Ingest SOPs and extract structured steps.
7. Compare observed workflow to SOP and classify deviations.
8. Analyze timing (active/idle/rework/bottlenecks/execution stats).
9. Generate evidence-based recommendations with clearly-labeled estimates.
10. Produce reports (JSON/HTML/CSV now; PDF/DOCX/XLSX/ZIP planned) and evidence
    packages.
11. Provide training material from validated workflows (planned).
12. Maintain org/client-isolated learning memory (planned).

## 4. Data entities
All 26 required entities are defined in `src/shared/types.ts` and mapped to
`src/main/db/schema.ts`: Organization, Client, Department, User, Role, Process,
SOP, SOP version, SOP step, Audit session, Capture event, Screenshot, Screenshot
cluster, Workflow, Workflow version, Workflow step, Finding, Recommendation,
Training module, Training session, Note, Approval, Export, System log, Retention
policy.

## 5. Roles (enforced in main process)
system_administrator, savvytech_consultant, client_administrator, auditor,
process_owner, supervisor, trainer, employee/participant, read_only_reviewer.

## 6. Acceptance criteria for this delivery
See `docs/IMPLEMENTATION_CHECKLIST.md` and `docs/TEST_RESULTS.md`. The core
evidence loop (capture → numbered evidence → dedup → propose → compare → timing →
recommend → report → recover) is implemented and covered by 45 passing tests; a
real sample audit package is generated in `sample-data/`.
