/**
 * SQLCipher schema. Every capture-session and screenshot write is transactional
 * (see database.ts) so a crash mid-write cannot corrupt evidence. The schema
 * enforces multi-tenant isolation via organization_id / client_id on every
 * top-level entity and foreign keys with ON DELETE restrictions where evidence
 * must be preserved.
 */
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL, branding TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(organization_id);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, permissions TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  client_id TEXT REFERENCES clients(id),
  display_name TEXT NOT NULL, email TEXT, role_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processes (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  assigned_sop_id TEXT, current_workflow_version_id TEXT,
  last_audit_date TEXT, compliance_score REAL, average_completion_ms INTEGER,
  observed_executions INTEGER NOT NULL DEFAULT 0,
  unresolved_deviations INTEGER NOT NULL DEFAULT 0,
  training_status TEXT NOT NULL DEFAULT 'not_started', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_processes_client ON processes(client_id);

CREATE TABLE IF NOT EXISTS sops (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  department_id TEXT REFERENCES departments(id),
  title TEXT NOT NULL, owner TEXT, purpose TEXT,
  current_version_id TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sop_versions (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL REFERENCES sops(id),
  version TEXT NOT NULL, effective_date TEXT, source_type TEXT NOT NULL,
  preconditions TEXT NOT NULL DEFAULT '[]',
  required_systems TEXT NOT NULL DEFAULT '[]',
  required_forms TEXT NOT NULL DEFAULT '[]',
  approved INTEGER NOT NULL DEFAULT 0, approved_by TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sop_steps (
  id TEXT PRIMARY KEY,
  sop_version_id TEXT NOT NULL REFERENCES sop_versions(id),
  step_number INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
  warnings TEXT NOT NULL DEFAULT '[]', is_decision_point INTEGER NOT NULL DEFAULT 0,
  expected_output TEXT, screenshot_refs TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS audit_sessions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  process_id TEXT NOT NULL REFERENCES processes(id),
  sop_version_id TEXT REFERENCES sop_versions(id),
  participant_label TEXT NOT NULL, auditor_user_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL, config TEXT NOT NULL,
  started_at TEXT, stopped_at TEXT, paused_ms INTEGER NOT NULL DEFAULT 0,
  screenshot_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_process ON audit_sessions(process_id);

CREATE TABLE IF NOT EXISTS capture_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES audit_sessions(id),
  sequence INTEGER NOT NULL, type TEXT NOT NULL, timestamp TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL, since_prev_ms INTEGER NOT NULL,
  active_app TEXT, window_title TEXT, monitor_id INTEGER, nav_key TEXT,
  screenshot_id TEXT,
  UNIQUE(session_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_events_session ON capture_events(session_id, sequence);

CREATE TABLE IF NOT EXISTS screenshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES audit_sessions(id),
  number INTEGER NOT NULL, timestamp TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL, since_prev_ms INTEGER NOT NULL,
  trigger_type TEXT NOT NULL, active_app TEXT, window_title TEXT, monitor_id INTEGER,
  screen_state TEXT NOT NULL DEFAULT 'unknown',
  original_path TEXT NOT NULL, original_sha256 TEXT NOT NULL,
  perceptual_hash TEXT, duplicate_similarity REAL, cluster_id TEXT,
  redaction_status TEXT NOT NULL DEFAULT 'none',
  detected_sensitive TEXT NOT NULL DEFAULT '[]',
  derived TEXT NOT NULL DEFAULT '[]',
  hidden INTEGER NOT NULL DEFAULT 0, workflow_step_id TEXT, auditor_note TEXT,
  UNIQUE(session_id, number)
);
CREATE INDEX IF NOT EXISTS idx_shots_session ON screenshots(session_id, number);

CREATE TABLE IF NOT EXISTS screenshot_clusters (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES audit_sessions(id),
  member_ids TEXT NOT NULL, representative_id TEXT, reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY, process_id TEXT NOT NULL REFERENCES processes(id),
  session_id TEXT REFERENCES audit_sessions(id),
  current_version_id TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_versions (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id),
  version INTEGER NOT NULL, origin TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0, approved_by TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id TEXT PRIMARY KEY,
  workflow_version_id TEXT NOT NULL REFERENCES workflow_versions(id),
  step_order INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
  member_screenshot_ids TEXT NOT NULL DEFAULT '[]', representative_screenshot_id TEXT,
  confidence REAL NOT NULL DEFAULT 0.5, needs_human_review INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES audit_sessions(id),
  kind TEXT NOT NULL, severity TEXT NOT NULL, sop_step_id TEXT, observed_step_id TEXT,
  evidence_numbers TEXT NOT NULL DEFAULT '[]', timestamp TEXT, explanation TEXT NOT NULL,
  confidence REAL NOT NULL, review_status TEXT NOT NULL DEFAULT 'unreviewed',
  recommended_action TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY, process_id TEXT NOT NULL REFERENCES processes(id),
  session_id TEXT REFERENCES audit_sessions(id),
  title TEXT NOT NULL, problem TEXT NOT NULL,
  evidence_numbers TEXT NOT NULL DEFAULT '[]', finding_ids TEXT NOT NULL DEFAULT '[]',
  current_impact_ms INTEGER, proposed_change TEXT NOT NULL,
  est_time_savings_ms INTEGER, est_labor_savings_usd REAL, est_error_reduction_pct REAL,
  difficulty TEXT NOT NULL, risk TEXT NOT NULL, confidence REAL NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_modules (
  id TEXT PRIMARY KEY, process_id TEXT NOT NULL REFERENCES processes(id),
  workflow_version_id TEXT NOT NULL REFERENCES workflow_versions(id),
  title TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id TEXT PRIMARY KEY, training_module_id TEXT NOT NULL REFERENCES training_modules(id),
  trainee_user_id TEXT NOT NULL REFERENCES users(id),
  completed_steps INTEGER NOT NULL DEFAULT 0, total_steps INTEGER NOT NULL,
  passed_knowledge_check INTEGER, supervisor_reviewed_by TEXT,
  started_at TEXT NOT NULL, completed_at TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES audit_sessions(id),
  author_user_id TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL,
  audio_path TEXT, at_elapsed_ms INTEGER, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  approved_by TEXT NOT NULL, decision TEXT NOT NULL, comment TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY, session_id TEXT, process_id TEXT, kind TEXT NOT NULL,
  format TEXT NOT NULL, path TEXT NOT NULL, sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_logs (
  id TEXT PRIMARY KEY, level TEXT NOT NULL, category TEXT NOT NULL,
  message TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retention_policies (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id),
  retain_days INTEGER NOT NULL, auto_delete_originals INTEGER NOT NULL DEFAULT 0,
  auto_delete_derived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
`;
