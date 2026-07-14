/**
 * Generates a sample audit package end-to-end WITHOUT the native DB, exercising
 * the real analysis + report modules. Produces:
 *   sample-data/sample-report.html
 *   sample-data/sample-report.json
 *   sample-data/sample-findings.csv
 *
 * This is the "sample audit session / workflow / report" deliverable (spec
 * section 23) and doubles as an integration smoke test of the pure pipeline.
 * Run with: npx tsx scripts/generate-sample.ts
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseSopText } from '../src/main/sop/ingest';
import { compareWorkflowToSop, complianceScore, normalizeKey, type ComparableStep } from '../src/main/analysis/comparison';
import { computeProcessTiming } from '../src/main/analysis/timing';
import { generateRecommendations } from '../src/main/analysis/recommendations';
import { auditReportHtml, auditReportJson, findingsCsv, type ReportContext } from '../src/main/reports/reports';
import type { AuditSession, CaptureEvent, Finding, Recommendation, Screenshot, WorkflowStep } from '../src/shared/types';

async function main() {
  const sopText = await fs.readFile(path.join(__dirname, '../sample-data/sample-sop.md'), 'utf8');
  const sop = parseSopText(sopText);

  // Simulated observed workflow: the employee SKIPPED the second-approval decision
  // and REPEATED the "enter refund" step (rework) — realistic deviations.
  const observedLabels = [
    'Open the Billing Portal and locate the customer order',
    'Verify the refund amount matches the approved authorization',
    'Enter the refund in the Billing Portal',
    'Enter the refund in the Billing Portal', // repeated (rework)
    'Send the customer a confirmation email',
  ];
  const observed: ComparableStep[] = observedLabels.map((label, i) => ({
    key: normalizeKey(label), label, index: i, screenshotNumbers: [i + 1],
  }));
  const sopComparable: ComparableStep[] = sop.steps.map((s, i) => ({
    key: normalizeKey(s.title), label: s.title, index: i, screenshotNumbers: [],
  }));

  const findingsRaw = compareWorkflowToSop(sopComparable, observed);
  const compliance = complianceScore(findingsRaw, sop.steps.length);

  // Simulated timing: step 3 (enter refund) is slow + rework.
  const steps: WorkflowStep[] = observedLabels.map((label, i) => ({
    id: `st${i + 1}`, workflowVersionId: 'v1', order: i + 1, title: label, description: '',
    memberScreenshotIds: [`sh${i + 1}`], representativeScreenshotId: `sh${i + 1}`,
    confidence: 0.8, needsHumanReview: false, durationMs: null,
  }));
  const screenshotStepIndex = new Map(steps.map((s, i) => [`sh${i + 1}`, s.id]));
  const events: CaptureEvent[] = [];
  let elapsed = 0;
  const gaps = [8000, 12000, 45000, 40000, 90000, 15000]; // ms between steps (idle before email)
  observedLabels.forEach((_l, i) => {
    events.push({
      id: `e${i}`, sessionId: 'ses_sample', sequence: i + 1, type: i === 4 ? 'app_change' : 'mouse_click',
      timestamp: new Date(elapsed).toISOString(), elapsedMs: elapsed, sincePrevMs: gaps[i] ?? 0,
      activeApp: 'Billing Portal', windowTitle: null, monitorId: 1, navKey: null, screenshotId: `sh${i + 1}`,
    });
    elapsed += gaps[i] ?? 0;
  });
  const timing = computeProcessTiming(events, steps, screenshotStepIndex);

  const recs = generateRecommendations({ findings: findingsRaw, timing, hourlyRateUsd: 45 });

  const session: AuditSession = {
    id: 'ses_sample', clientId: 'cli_acme', departmentId: 'dep_ar', processId: 'prc_refund',
    sopVersionId: 'sopv_1', participantLabel: 'Anonymous participant #1', auditorUserId: 'usr_admin',
    state: 'stopped', config: {} as never, startedAt: new Date(0).toISOString(),
    stoppedAt: new Date(elapsed).toISOString(), pausedMs: 0, screenshotCount: 5, createdAt: new Date(0).toISOString(),
  };

  const findings: Finding[] = findingsRaw.filter((f) => f.kind !== 'completed').map((f, i) => ({
    id: `fnd_${i}`, sessionId: session.id, kind: f.kind, severity: f.severity, sopStepId: null,
    observedStepId: null, evidenceScreenshotNumbers: f.evidenceScreenshotNumbers, timestamp: null,
    explanation: f.explanation, confidence: f.confidence, reviewStatus: 'unreviewed', recommendedAction: f.recommendedAction,
  }));
  const recommendations: Recommendation[] = recs.map((r, i) => ({
    id: `rec_${i}`, processId: session.processId, sessionId: session.id, title: r.title, problem: r.problem,
    supportingEvidenceScreenshotNumbers: r.evidenceScreenshotNumbers, supportingFindingIds: [],
    currentImpactMs: r.currentImpactMs, proposedChange: r.proposedChange, estimatedTimeSavingsMs: r.estimatedTimeSavingsMs,
    estimatedLaborSavingsUsd: r.estimatedLaborSavingsUsd, estimatedErrorReductionPct: r.estimatedErrorReductionPct,
    implementationDifficulty: r.implementationDifficulty, risk: r.risk, confidence: r.confidence,
    requiresHumanApproval: true, approved: false, createdAt: new Date(0).toISOString(),
  }));
  const screenshots: Screenshot[] = observedLabels.map((_l, i) => ({
    id: `sh${i + 1}`, sessionId: session.id, number: i + 1, timestamp: new Date(0).toISOString(),
    elapsedMs: 0, sincePrevMs: 0, triggerType: 'mouse_click', activeApp: 'Billing Portal', windowTitle: null,
    monitorId: 1, screenState: 'unknown', originalPath: `evidence/${String(i + 1).padStart(3, '0')}.png`,
    originalSha256: 'sample'.padEnd(64, '0'), perceptualHash: null, duplicateSimilarity: null, clusterId: null,
    redactionStatus: 'none', detectedSensitive: [], derived: [], hidden: false, workflowStepId: `st${i + 1}`, auditorNote: null,
  }));

  const ctx: ReportContext = {
    session, processName: 'Customer Refund Process', clientName: 'Acme Corp', screenshots, findings,
    recommendations, timing, complianceScore: compliance,
    branding: { companyName: 'SavvyTech Automations', primaryColor: '#0b5cad' },
    generatedAt: '2026-07-14T12:00:00.000Z',
  };

  const outDir = path.join(__dirname, '../sample-data');
  await fs.writeFile(path.join(outDir, 'sample-report.html'), auditReportHtml(ctx));
  await fs.writeFile(path.join(outDir, 'sample-report.json'), auditReportJson(ctx));
  await fs.writeFile(path.join(outDir, 'sample-findings.csv'), findingsCsv(findings));

  console.log(`Sample audit generated: compliance ${compliance}%, ${findings.length} findings, ${recommendations.length} recommendations.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
