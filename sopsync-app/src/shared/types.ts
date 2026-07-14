/**
 * SOPsync shared domain model.
 *
 * Every entity required by the specification (section 20) is represented here.
 * These types are the single source of truth shared between the Electron main
 * process, the preload bridge, and the renderer UI.
 *
 * Design rules encoded here:
 *  - Evidence integrity: screenshots reference an immutable `originalSha256`;
 *    edits create `derived` versions, never mutate the original.
 *  - Privacy: capture events never carry raw keystroke characters. Only a
 *    coarse `navKey` category is allowed, and only for workflow-navigation keys.
 *  - Multi-tenant isolation: everything hangs off `organizationId` / `clientId`.
 */

export type ID = string;
export type ISOTimestamp = string; // e.g. 2026-07-14T12:00:00.000Z

// ---------------------------------------------------------------------------
// Roles & access
// ---------------------------------------------------------------------------

export type RoleName =
  | 'system_administrator'
  | 'savvytech_consultant'
  | 'client_administrator'
  | 'auditor'
  | 'process_owner'
  | 'supervisor'
  | 'trainer'
  | 'employee'
  | 'read_only_reviewer';

export type Permission =
  | 'org.manage'
  | 'client.manage'
  | 'capture.run'
  | 'capture.review'
  | 'sop.manage'
  | 'workflow.approve'
  | 'finding.resolve'
  | 'recommendation.manage'
  | 'training.deliver'
  | 'export.create'
  | 'settings.manage'
  | 'audit.read';

export interface Role {
  id: ID;
  name: RoleName;
  permissions: Permission[];
}

export interface User {
  id: ID;
  organizationId: ID;
  clientId: ID | null; // null for SavvyTech-internal users
  displayName: string;
  email: string | null;
  roleName: RoleName;
  active: boolean;
  createdAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Org hierarchy
// ---------------------------------------------------------------------------

export interface Organization {
  id: ID;
  name: string;
  createdAt: ISOTimestamp;
}

export interface Client {
  id: ID;
  organizationId: ID;
  name: string;
  branding: BrandingConfig | null;
  createdAt: ISOTimestamp;
}

export interface Department {
  id: ID;
  clientId: ID;
  name: string;
  createdAt: ISOTimestamp;
}

export interface BrandingConfig {
  primaryColor?: string;
  logoDataUri?: string;
  companyName?: string;
}

// ---------------------------------------------------------------------------
// Process, SOP, workflow
// ---------------------------------------------------------------------------

export type TrainingStatus = 'not_started' | 'in_progress' | 'trained' | 'needs_refresh';

export interface Process {
  id: ID;
  clientId: ID;
  departmentId: ID;
  name: string;
  assignedSopId: ID | null;
  currentApprovedWorkflowVersionId: ID | null;
  lastAuditDate: ISOTimestamp | null;
  complianceScore: number | null; // 0..100
  averageCompletionMs: number | null;
  observedExecutions: number;
  unresolvedDeviations: number;
  trainingStatus: TrainingStatus;
  createdAt: ISOTimestamp;
}

export interface Sop {
  id: ID;
  clientId: ID;
  departmentId: ID | null;
  title: string;
  owner: string | null;
  purpose: string | null;
  currentVersionId: ID | null;
  createdAt: ISOTimestamp;
}

export interface SopVersion {
  id: ID;
  sopId: ID;
  version: string; // e.g. "1.3"
  effectiveDate: ISOTimestamp | null;
  sourceType: 'pdf' | 'docx' | 'text' | 'markdown' | 'image' | 'scan' | 'workflow' | 'manual';
  preconditions: string[];
  requiredSystems: string[];
  requiredForms: string[];
  approved: boolean;
  approvedBy: ID | null;
  createdAt: ISOTimestamp;
}

export interface SopStep {
  id: ID;
  sopVersionId: ID;
  stepNumber: number;
  title: string;
  description: string;
  warnings: string[];
  isDecisionPoint: boolean;
  expectedOutput: string | null;
  /** Screenshots explicitly attached to this SOP step, tagged by provenance. */
  screenshotRefs: SopScreenshotRef[];
}

export type ScreenshotProvenance =
  | 'original_sop'
  | 'audit'
  | 'ai_recommended'
  | 'human_approved';

export interface SopScreenshotRef {
  screenshotId: ID;
  provenance: ScreenshotProvenance;
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export type SessionState =
  | 'created'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'recovered';

export interface CaptureConfig {
  monitorId: number;
  includedApps: string[]; // bundle ids / app names; empty = all (minus excluded)
  excludedApps: string[];
  excludedUrlPatterns: string[];
  timedIntervalMs: number | null; // null disables timed capture
  captureOnClick: boolean;
  captureOnAppChange: boolean;
  captureOnWindowChange: boolean;
  captureOnNavKey: boolean;
  captureWindowTitles: boolean; // authorization gate
  redaction: RedactionConfig;
  duplicateSimilarityThreshold: number; // 0..1 hamming-normalized
}

export interface RedactionConfig {
  autoMaskPasswordFields: boolean;
  autoDetect: SensitiveKind[];
  autoApplyMask: boolean; // if false, only *suggest*
}

export type SensitiveKind = 'password' | 'ssn' | 'card' | 'email' | 'phone' | 'medical' | 'pii';

export interface AuditSession {
  id: ID;
  clientId: ID;
  departmentId: ID;
  processId: ID;
  sopVersionId: ID | null;
  participantLabel: string; // employee name OR anonymous participant id
  auditorUserId: ID;
  state: SessionState;
  config: CaptureConfig;
  startedAt: ISOTimestamp | null;
  stoppedAt: ISOTimestamp | null;
  /** Sum of paused intervals so elapsed active time is accurate. */
  pausedMs: number;
  screenshotCount: number;
  createdAt: ISOTimestamp;
}

export type CaptureEventType =
  | 'session_start'
  | 'session_stop'
  | 'session_pause'
  | 'session_resume'
  | 'mouse_click'
  | 'key_activity' // NO character stored
  | 'nav_key' // coarse category only
  | 'app_change'
  | 'window_change'
  | 'screen_transition'
  | 'idle_start'
  | 'idle_end'
  | 'timed'
  | 'manual';

/** Only these coarse navigation categories may ever be stored for a keypress. */
export type NavKey = 'enter' | 'tab' | 'escape' | 'arrow' | 'delete' | 'space' | 'submit';

export interface CaptureEvent {
  id: ID;
  sessionId: ID;
  sequence: number; // strictly increasing per session
  type: CaptureEventType;
  timestamp: ISOTimestamp;
  elapsedMs: number; // active elapsed since session start (excludes paused)
  sincePrevMs: number;
  activeApp: string | null;
  windowTitle: string | null; // null unless captureWindowTitles authorized
  monitorId: number | null;
  navKey: NavKey | null; // set ONLY for nav_key events
  screenshotId: ID | null; // set if this event triggered a screenshot
}

export type RedactionStatus = 'none' | 'suggested' | 'redacted';
export type ScreenState = 'empty_form' | 'partial_entry' | 'completed_state' | 'confirmation' | 'unknown';

export interface Screenshot {
  id: ID;
  sessionId: ID;
  /** Sequential display number: 1,2,3... rendered zero-padded (001) in UI. */
  number: number;
  timestamp: ISOTimestamp;
  elapsedMs: number;
  sincePrevMs: number;
  triggerType: CaptureEventType;
  activeApp: string | null;
  windowTitle: string | null;
  monitorId: number | null;
  screenState: ScreenState;
  /** Immutable evidence: path + hash of the ORIGINAL, never overwritten. */
  originalPath: string;
  originalSha256: string;
  /** Perceptual hash for near-duplicate detection. */
  perceptualHash: string | null;
  duplicateSimilarity: number | null; // similarity to prev kept screenshot 0..1
  clusterId: ID | null;
  redactionStatus: RedactionStatus;
  detectedSensitive: SensitiveKind[];
  /** Non-destructive edits produce derived versions. */
  derived: DerivedImage[];
  hidden: boolean; // hidden from review, original preserved
  workflowStepId: ID | null;
  auditorNote: string | null;
}

export type DerivedKind = 'redaction' | 'crop' | 'annotation' | 'representative';

export interface DerivedImage {
  id: ID;
  kind: DerivedKind;
  path: string;
  sha256: string;
  createdAt: ISOTimestamp;
  createdBy: ID;
  note: string | null;
}

export interface ScreenshotCluster {
  id: ID;
  sessionId: ID;
  memberScreenshotIds: ID[];
  representativeScreenshotId: ID | null;
  reason: 'near_duplicate' | 'repeated_input';
}

// ---------------------------------------------------------------------------
// Workflow (observed / proposed / approved)
// ---------------------------------------------------------------------------

export type WorkflowOrigin = 'ai_proposed' | 'human_edited' | 'approved';

export interface Workflow {
  id: ID;
  processId: ID;
  sessionId: ID | null; // source audit session, if observed
  currentVersionId: ID | null;
  createdAt: ISOTimestamp;
}

export interface WorkflowVersion {
  id: ID;
  workflowId: ID;
  version: number;
  origin: WorkflowOrigin;
  approved: boolean;
  approvedBy: ID | null;
  createdAt: ISOTimestamp;
}

export interface WorkflowStep {
  id: ID;
  workflowVersionId: ID;
  order: number;
  title: string;
  description: string;
  memberScreenshotIds: ID[];
  representativeScreenshotId: ID | null;
  /** Confidence of AI grouping; human approval still required. */
  confidence: number; // 0..1
  needsHumanReview: boolean;
  durationMs: number | null;
}

// ---------------------------------------------------------------------------
// Findings, recommendations
// ---------------------------------------------------------------------------

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type DeviationKind =
  | 'completed'
  | 'skipped'
  | 'out_of_order'
  | 'repeated'
  | 'undocumented'
  | 'wrong_screen'
  | 'wrong_field'
  | 'excessive_delay'
  | 'rework'
  | 'backtracking'
  | 'app_switching'
  | 'idle'
  | 'interruption'
  | 'outdated_sop';

export type ReviewStatus = 'unreviewed' | 'confirmed' | 'dismissed' | 'resolved';

export interface Finding {
  id: ID;
  sessionId: ID;
  kind: DeviationKind;
  severity: Severity;
  sopStepId: ID | null;
  observedStepId: ID | null;
  evidenceScreenshotNumbers: number[];
  timestamp: ISOTimestamp | null;
  explanation: string; // must reference evidence, never vague
  confidence: number; // 0..1
  reviewStatus: ReviewStatus;
  recommendedAction: string;
}

export type RecImpactUnit = 'ms' | 'usd' | 'count' | 'percent';

export interface Recommendation {
  id: ID;
  processId: ID;
  sessionId: ID | null;
  title: string;
  problem: string;
  supportingEvidenceScreenshotNumbers: number[];
  supportingFindingIds: ID[];
  currentImpactMs: number | null;
  proposedChange: string;
  estimatedTimeSavingsMs: number | null; // ESTIMATE — labeled as such in UI
  estimatedLaborSavingsUsd: number | null;
  estimatedErrorReductionPct: number | null;
  implementationDifficulty: 'low' | 'medium' | 'high';
  risk: 'low' | 'medium' | 'high';
  confidence: number;
  requiresHumanApproval: true;
  approved: boolean;
  createdAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export interface TrainingModule {
  id: ID;
  processId: ID;
  workflowVersionId: ID;
  title: string;
  createdAt: ISOTimestamp;
}

export interface TrainingSession {
  id: ID;
  trainingModuleId: ID;
  traineeUserId: ID;
  completedSteps: number;
  totalSteps: number;
  passedKnowledgeCheck: boolean | null;
  supervisorReviewedBy: ID | null;
  startedAt: ISOTimestamp;
  completedAt: ISOTimestamp | null;
}

// ---------------------------------------------------------------------------
// Cross-cutting
// ---------------------------------------------------------------------------

export interface Note {
  id: ID;
  sessionId: ID;
  authorUserId: ID;
  kind: 'text' | 'voice';
  body: string; // text, or transcript/summary reference for voice
  audioPath: string | null;
  atElapsedMs: number | null;
  createdAt: ISOTimestamp;
}

export interface Approval {
  id: ID;
  entityType: 'sop_version' | 'workflow_version' | 'recommendation' | 'sop_screenshot';
  entityId: ID;
  approvedBy: ID;
  decision: 'approved' | 'rejected';
  comment: string | null;
  createdAt: ISOTimestamp;
}

export interface Export {
  id: ID;
  sessionId: ID | null;
  processId: ID | null;
  kind: string; // e.g. 'audit_report', 'evidence_package'
  format: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'json' | 'html' | 'zip';
  path: string;
  sha256: string;
  createdBy: ID;
  createdAt: ISOTimestamp;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SystemLog {
  id: ID;
  level: LogLevel;
  category: string;
  message: string; // plain-language, operator-readable
  detail: string | null;
  createdAt: ISOTimestamp;
}

export interface RetentionPolicy {
  id: ID;
  clientId: ID;
  retainDays: number;
  autoDeleteOriginals: boolean;
  autoDeleteDerived: boolean;
  createdAt: ISOTimestamp;
}
