import type { Repositories } from '../db/repositories';
import type { AnalysisResult } from '@shared/ipc';
import { newId, nowIso } from '@shared/id';
import { clusterByHash, type HashedShot } from './duplicates';
import { proposeWorkflow, type ShotForProposal } from './workflowProposal';
import { computeProcessTiming } from './timing';
import { generateRecommendations } from './recommendations';
import { compareWorkflowToSop, complianceScore, normalizeKey, type ComparableStep, type RawFinding } from './comparison';
import type { Finding, Recommendation } from '@shared/types';
import { logger } from '../logging/logger';

/**
 * Runs the full evidence-analysis pipeline for a stopped/recovered session and
 * persists clusters, findings, and recommendations. This is the deterministic
 * "AI organization" step (spec sections 8, 10, 11, 12). It NEVER fabricates:
 * comparison runs only when SOP steps exist, and every finding/recommendation is
 * evidence-linked. Human approval of the proposed workflow is still required
 * before it becomes authoritative — this function only proposes.
 */
export interface SopStepInput {
  key: string;
  label: string;
}

export function runSessionAnalysis(
  repos: Repositories,
  sessionId: string,
  threshold: number,
  sopSteps: SopStepInput[],
): AnalysisResult {
  const session = repos.getSession(sessionId);
  if (!session) throw new Error(`session ${sessionId} not found`);
  const screenshots = repos.listScreenshots(sessionId);
  const events = repos.listEvents(sessionId);

  // 1. Duplicate clustering (screenshots without a perceptual hash cluster alone).
  const hashed: HashedShot[] = screenshots
    .filter((s) => s.perceptualHash)
    .map((s) => ({ id: s.id, number: s.number, hash: s.perceptualHash! }));
  const clusters = clusterByHash(hashed, threshold);
  repos.tx(() => {
    for (const c of clusters) {
      if (c.memberIds.length < 2) continue;
      repos.insertCluster({
        id: newId('clu'), sessionId, memberScreenshotIds: c.memberIds,
        representativeScreenshotId: c.representativeId, reason: 'near_duplicate',
      });
    }
  });

  // 2. Propose a workflow from evidence.
  const clusterOf = new Map<string, string>();
  clusters.forEach((c) => c.memberIds.forEach((id) => clusterOf.set(id, c.representativeId)));
  const forProposal: ShotForProposal[] = screenshots.map((s) => ({
    id: s.id, number: s.number, clusterId: clusterOf.get(s.id) ?? null,
    screenState: s.screenState, activeApp: s.activeApp, windowTitle: s.windowTitle,
  }));
  const proposed = proposeWorkflow(forProposal);

  // 3. Timing (step map empty until a workflow is approved; totals still valid).
  const timing = computeProcessTiming(events, [], new Map());

  // 4. Comparison vs SOP (only if SOP steps exist — never invents a comparison).
  let findings: RawFinding[] = [];
  let compliance: number | null = null;
  if (sopSteps.length > 0) {
    const sopComparable: ComparableStep[] = sopSteps.map((s, i) => ({
      key: s.key || normalizeKey(s.label), label: s.label, index: i, screenshotNumbers: [],
    }));
    const observed: ComparableStep[] = proposed.map((p, i) => ({
      key: normalizeKey(p.title), label: p.title, index: i,
      screenshotNumbers: p.memberScreenshotIds
        .map((id) => screenshots.find((s) => s.id === id)?.number)
        .filter((n): n is number => n != null),
    }));
    findings = compareWorkflowToSop(sopComparable, observed);
    compliance = complianceScore(findings, sopSteps.length);
  }

  // 5. Recommendations.
  const recs = generateRecommendations({ findings, timing });

  // 6. Persist findings + recommendations transactionally.
  repos.tx(() => {
    for (const f of findings) {
      if (f.kind === 'completed') continue; // don't persist non-issues as findings
      const finding: Finding = {
        id: newId('fnd'), sessionId, kind: f.kind, severity: f.severity,
        sopStepId: null, observedStepId: null, evidenceScreenshotNumbers: f.evidenceScreenshotNumbers,
        timestamp: nowIso(), explanation: f.explanation, confidence: f.confidence,
        reviewStatus: 'unreviewed', recommendedAction: f.recommendedAction,
      };
      repos.insertFinding(finding);
    }
    for (const r of recs) {
      const rec: Recommendation = {
        id: newId('rec'), processId: session.processId, sessionId,
        title: r.title, problem: r.problem,
        supportingEvidenceScreenshotNumbers: r.evidenceScreenshotNumbers, supportingFindingIds: [],
        currentImpactMs: r.currentImpactMs, proposedChange: r.proposedChange,
        estimatedTimeSavingsMs: r.estimatedTimeSavingsMs, estimatedLaborSavingsUsd: r.estimatedLaborSavingsUsd,
        estimatedErrorReductionPct: r.estimatedErrorReductionPct, implementationDifficulty: r.implementationDifficulty,
        risk: r.risk, confidence: r.confidence, requiresHumanApproval: true, approved: false, createdAt: nowIso(),
      };
      repos.insertRecommendation(rec);
    }
  });

  logger.info('analysis',
    `Analyzed session ${sessionId}: ${clusters.length} clusters, ${proposed.length} proposed steps, ` +
    `${findings.filter((f) => f.kind !== 'completed').length} findings, ${recs.length} recommendations.`);

  return {
    clusters: clusters.filter((c) => c.memberIds.length > 1).length,
    proposedSteps: proposed.length,
    findings: findings.filter((f) => f.kind !== 'completed'),
    complianceScore: compliance,
    totalMs: timing.totalMs,
    recommendations: recs.length,
  };
}
