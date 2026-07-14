import type { Database } from './database';
import type {
  AuditSession, CaptureEvent, Screenshot, Finding, Recommendation, SystemLog,
  Organization, Client, Department, User, Process, ScreenshotCluster,
} from '@shared/types';

/**
 * Thin, typed repositories over the encrypted DB. JSON-typed columns are
 * (de)serialized here so callers work with domain objects. Session + screenshot
 * writes go through Database.tx() at the call site to stay transaction-safe.
 */

const j = (v: unknown) => JSON.stringify(v ?? null);
const p = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string') return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

export class Repositories {
  constructor(private readonly db: Database) {}

  /** Expose transaction wrapping for multi-write operations. */
  tx<T>(fn: () => T): T { return this.db.tx(fn); }

  // --- Organizations / clients / departments / users ---
  insertOrganization(o: Organization): void {
    this.db.prepare(`INSERT INTO organizations(id,name,created_at) VALUES (?,?,?)`)
      .run(o.id, o.name, o.createdAt);
  }
  insertClient(c: Client): void {
    this.db.prepare(`INSERT INTO clients(id,organization_id,name,branding,created_at) VALUES (?,?,?,?,?)`)
      .run(c.id, c.organizationId, c.name, j(c.branding), c.createdAt);
  }
  insertDepartment(d: Department): void {
    this.db.prepare(`INSERT INTO departments(id,client_id,name,created_at) VALUES (?,?,?,?)`)
      .run(d.id, d.clientId, d.name, d.createdAt);
  }
  insertUser(u: User): void {
    this.db.prepare(
      `INSERT INTO users(id,organization_id,client_id,display_name,email,role_name,active,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(u.id, u.organizationId, u.clientId, u.displayName, u.email, u.roleName, u.active ? 1 : 0, u.createdAt);
  }
  insertProcess(pr: Process): void {
    this.db.prepare(
      `INSERT INTO processes(id,client_id,department_id,name,assigned_sop_id,current_workflow_version_id,
        last_audit_date,compliance_score,average_completion_ms,observed_executions,unresolved_deviations,
        training_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(pr.id, pr.clientId, pr.departmentId, pr.name, pr.assignedSopId, pr.currentApprovedWorkflowVersionId,
      pr.lastAuditDate, pr.complianceScore, pr.averageCompletionMs, pr.observedExecutions,
      pr.unresolvedDeviations, pr.trainingStatus, pr.createdAt);
  }
  listProcesses(clientId: string): Process[] {
    const rows = this.db.prepare(`SELECT * FROM processes WHERE client_id=? ORDER BY name`).all(clientId) as any[];
    return rows.map(rowToProcess);
  }

  // --- Sessions ---
  insertSession(s: AuditSession): void {
    this.db.prepare(
      `INSERT INTO audit_sessions(id,client_id,department_id,process_id,sop_version_id,participant_label,
        auditor_user_id,state,config,started_at,stopped_at,paused_ms,screenshot_count,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(s.id, s.clientId, s.departmentId, s.processId, s.sopVersionId, s.participantLabel,
      s.auditorUserId, s.state, j(s.config), s.startedAt, s.stoppedAt, s.pausedMs, s.screenshotCount, s.createdAt);
  }
  updateSessionState(id: string, state: string, patch: Partial<Pick<AuditSession, 'startedAt' | 'stoppedAt' | 'pausedMs' | 'screenshotCount'>>): void {
    this.db.prepare(
      `UPDATE audit_sessions SET state=?,
        started_at=COALESCE(?,started_at), stopped_at=COALESCE(?,stopped_at),
        paused_ms=COALESCE(?,paused_ms), screenshot_count=COALESCE(?,screenshot_count)
       WHERE id=?`,
    ).run(state, patch.startedAt ?? null, patch.stoppedAt ?? null,
      patch.pausedMs ?? null, patch.screenshotCount ?? null, id);
  }
  getSession(id: string): AuditSession | null {
    const r = this.db.prepare(`SELECT * FROM audit_sessions WHERE id=?`).get(id) as any;
    return r ? rowToSession(r) : null;
  }
  /** Sessions left running/paused at startup → candidates for crash recovery. */
  findInterruptedSessions(): AuditSession[] {
    const rows = this.db.prepare(
      `SELECT * FROM audit_sessions WHERE state IN ('running','paused')`,
    ).all() as any[];
    return rows.map(rowToSession);
  }

  // --- Events (append-only) ---
  insertEvent(e: CaptureEvent): void {
    this.db.prepare(
      `INSERT INTO capture_events(id,session_id,sequence,type,timestamp,elapsed_ms,since_prev_ms,
        active_app,window_title,monitor_id,nav_key,screenshot_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(e.id, e.sessionId, e.sequence, e.type, e.timestamp, e.elapsedMs, e.sincePrevMs,
      e.activeApp, e.windowTitle, e.monitorId, e.navKey, e.screenshotId);
  }
  listEvents(sessionId: string): CaptureEvent[] {
    const rows = this.db.prepare(
      `SELECT * FROM capture_events WHERE session_id=? ORDER BY sequence`,
    ).all(sessionId) as any[];
    return rows.map(rowToEvent);
  }
  maxSequence(sessionId: string): number {
    const r = this.db.prepare(`SELECT MAX(sequence) AS m FROM capture_events WHERE session_id=?`).get(sessionId) as any;
    return r?.m ?? 0;
  }

  // --- Screenshots (immutable originals) ---
  insertScreenshot(s: Screenshot): void {
    this.db.prepare(
      `INSERT INTO screenshots(id,session_id,number,timestamp,elapsed_ms,since_prev_ms,trigger_type,
        active_app,window_title,monitor_id,screen_state,original_path,original_sha256,perceptual_hash,
        duplicate_similarity,cluster_id,redaction_status,detected_sensitive,derived,hidden,workflow_step_id,auditor_note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(s.id, s.sessionId, s.number, s.timestamp, s.elapsedMs, s.sincePrevMs, s.triggerType,
      s.activeApp, s.windowTitle, s.monitorId, s.screenState, s.originalPath, s.originalSha256,
      s.perceptualHash, s.duplicateSimilarity, s.clusterId, s.redactionStatus, j(s.detectedSensitive),
      j(s.derived), s.hidden ? 1 : 0, s.workflowStepId, s.auditorNote);
  }
  /** Metadata-only updates. NEVER updates original_path/original_sha256 — evidence is immutable. */
  updateScreenshotMeta(id: string, patch: Partial<Pick<Screenshot,
    'screenState' | 'perceptualHash' | 'duplicateSimilarity' | 'clusterId' | 'redactionStatus' |
    'detectedSensitive' | 'derived' | 'hidden' | 'workflowStepId' | 'auditorNote'>>): void {
    const cur = this.getScreenshot(id);
    if (!cur) throw new Error(`screenshot ${id} not found`);
    const next = { ...cur, ...patch };
    this.db.prepare(
      `UPDATE screenshots SET screen_state=?,perceptual_hash=?,duplicate_similarity=?,cluster_id=?,
        redaction_status=?,detected_sensitive=?,derived=?,hidden=?,workflow_step_id=?,auditor_note=? WHERE id=?`,
    ).run(next.screenState, next.perceptualHash, next.duplicateSimilarity, next.clusterId,
      next.redactionStatus, j(next.detectedSensitive), j(next.derived), next.hidden ? 1 : 0,
      next.workflowStepId, next.auditorNote, id);
  }
  getScreenshot(id: string): Screenshot | null {
    const r = this.db.prepare(`SELECT * FROM screenshots WHERE id=?`).get(id) as any;
    return r ? rowToScreenshot(r) : null;
  }
  listScreenshots(sessionId: string): Screenshot[] {
    const rows = this.db.prepare(`SELECT * FROM screenshots WHERE session_id=? ORDER BY number`).all(sessionId) as any[];
    return rows.map(rowToScreenshot);
  }
  nextScreenshotNumber(sessionId: string): number {
    const r = this.db.prepare(`SELECT MAX(number) AS m FROM screenshots WHERE session_id=?`).get(sessionId) as any;
    return (r?.m ?? 0) + 1;
  }

  insertCluster(c: ScreenshotCluster): void {
    this.db.prepare(
      `INSERT INTO screenshot_clusters(id,session_id,member_ids,representative_id,reason) VALUES (?,?,?,?,?)`,
    ).run(c.id, c.sessionId, j(c.memberScreenshotIds), c.representativeScreenshotId, c.reason);
  }

  // --- Findings / recommendations ---
  insertFinding(f: Finding): void {
    this.db.prepare(
      `INSERT INTO findings(id,session_id,kind,severity,sop_step_id,observed_step_id,evidence_numbers,
        timestamp,explanation,confidence,review_status,recommended_action) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(f.id, f.sessionId, f.kind, f.severity, f.sopStepId, f.observedStepId,
      j(f.evidenceScreenshotNumbers), f.timestamp, f.explanation, f.confidence, f.reviewStatus, f.recommendedAction);
  }
  listFindings(sessionId: string): Finding[] {
    const rows = this.db.prepare(`SELECT * FROM findings WHERE session_id=?`).all(sessionId) as any[];
    return rows.map(rowToFinding);
  }
  insertRecommendation(r: Recommendation): void {
    this.db.prepare(
      `INSERT INTO recommendations(id,process_id,session_id,title,problem,evidence_numbers,finding_ids,
        current_impact_ms,proposed_change,est_time_savings_ms,est_labor_savings_usd,est_error_reduction_pct,
        difficulty,risk,confidence,approved,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(r.id, r.processId, r.sessionId, r.title, r.problem, j(r.supportingEvidenceScreenshotNumbers),
      j(r.supportingFindingIds), r.currentImpactMs, r.proposedChange, r.estimatedTimeSavingsMs,
      r.estimatedLaborSavingsUsd, r.estimatedErrorReductionPct, r.implementationDifficulty, r.risk,
      r.confidence, r.approved ? 1 : 0, r.createdAt);
  }

  // --- Logs ---
  insertLog(l: SystemLog): void {
    this.db.prepare(
      `INSERT INTO system_logs(id,level,category,message,detail,created_at) VALUES (?,?,?,?,?,?)`,
    ).run(l.id, l.level, l.category, l.message, l.detail, l.createdAt);
  }
  recentLogs(limit = 200): SystemLog[] {
    const rows = this.db.prepare(`SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?`).all(limit) as any[];
    return rows.map((r) => ({ id: r.id, level: r.level, category: r.category, message: r.message, detail: r.detail, createdAt: r.created_at }));
  }
}

// --- row mappers ---
function rowToSession(r: any): AuditSession {
  return {
    id: r.id, clientId: r.client_id, departmentId: r.department_id, processId: r.process_id,
    sopVersionId: r.sop_version_id, participantLabel: r.participant_label, auditorUserId: r.auditor_user_id,
    state: r.state, config: p(r.config, {} as any), startedAt: r.started_at, stoppedAt: r.stopped_at,
    pausedMs: r.paused_ms, screenshotCount: r.screenshot_count, createdAt: r.created_at,
  };
}
function rowToEvent(r: any): CaptureEvent {
  return {
    id: r.id, sessionId: r.session_id, sequence: r.sequence, type: r.type, timestamp: r.timestamp,
    elapsedMs: r.elapsed_ms, sincePrevMs: r.since_prev_ms, activeApp: r.active_app,
    windowTitle: r.window_title, monitorId: r.monitor_id, navKey: r.nav_key, screenshotId: r.screenshot_id,
  };
}
function rowToScreenshot(r: any): Screenshot {
  return {
    id: r.id, sessionId: r.session_id, number: r.number, timestamp: r.timestamp, elapsedMs: r.elapsed_ms,
    sincePrevMs: r.since_prev_ms, triggerType: r.trigger_type, activeApp: r.active_app,
    windowTitle: r.window_title, monitorId: r.monitor_id, screenState: r.screen_state,
    originalPath: r.original_path, originalSha256: r.original_sha256, perceptualHash: r.perceptual_hash,
    duplicateSimilarity: r.duplicate_similarity, clusterId: r.cluster_id, redactionStatus: r.redaction_status,
    detectedSensitive: p(r.detected_sensitive, []), derived: p(r.derived, []), hidden: !!r.hidden,
    workflowStepId: r.workflow_step_id, auditorNote: r.auditor_note,
  };
}
function rowToFinding(r: any): Finding {
  return {
    id: r.id, sessionId: r.session_id, kind: r.kind, severity: r.severity, sopStepId: r.sop_step_id,
    observedStepId: r.observed_step_id, evidenceScreenshotNumbers: p(r.evidence_numbers, []),
    timestamp: r.timestamp, explanation: r.explanation, confidence: r.confidence,
    reviewStatus: r.review_status, recommendedAction: r.recommended_action,
  };
}
function rowToProcess(r: any): Process {
  return {
    id: r.id, clientId: r.client_id, departmentId: r.department_id, name: r.name,
    assignedSopId: r.assigned_sop_id, currentApprovedWorkflowVersionId: r.current_workflow_version_id,
    lastAuditDate: r.last_audit_date, complianceScore: r.compliance_score,
    averageCompletionMs: r.average_completion_ms, observedExecutions: r.observed_executions,
    unresolvedDeviations: r.unresolved_deviations, trainingStatus: r.training_status, createdAt: r.created_at,
  };
}
