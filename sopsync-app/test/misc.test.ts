import { describe, it, expect } from 'vitest';
import { can, permissionsFor } from '@shared/roles';
import { proposeWorkflow, type ShotForProposal } from '@main/analysis/workflowProposal';
import { generateRecommendations } from '@main/analysis/recommendations';
import { auditReportJson, findingsCsv, auditReportHtml, type ReportContext } from '@main/reports/reports';
import type { Finding } from '@shared/types';

describe('role-based access', () => {
  it('grants and denies by role', () => {
    expect(can('system_administrator', 'settings.manage')).toBe(true);
    expect(can('employee', 'capture.run')).toBe(false);
    expect(can('auditor', 'capture.run')).toBe(true);
    expect(can('read_only_reviewer', 'audit.read')).toBe(true);
    expect(can('read_only_reviewer', 'workflow.approve')).toBe(false);
    expect(permissionsFor('employee').size).toBe(0);
  });
});

describe('workflow proposal', () => {
  it('splits steps on app change and flags low-confidence groups for review', () => {
    const shots: ShotForProposal[] = [
      { id: 's1', number: 1, clusterId: 'c1', screenState: 'empty_form', activeApp: 'Portal', windowTitle: null },
      { id: 's2', number: 2, clusterId: 'c1', screenState: 'completed_state', activeApp: 'Portal', windowTitle: null },
      { id: 's3', number: 3, clusterId: 'c2', screenState: 'unknown', activeApp: 'Email', windowTitle: null },
    ];
    const steps = proposeWorkflow(shots);
    expect(steps).toHaveLength(2);
    expect(steps[0]!.memberScreenshotIds).toEqual(['s1', 's2']);
    // representative prefers the completed state
    expect(steps[0]!.representativeScreenshotId).toBe('s2');
    // the Email step has no completed state → lower confidence → needs review
    expect(steps[1]!.needsHumanReview).toBe(true);
  });

  it('never proposes a step without backing evidence', () => {
    const steps = proposeWorkflow([]);
    expect(steps).toEqual([]);
  });
});

describe('recommendations', () => {
  it('fires evidence-based rules and labels labor savings only with a rate', () => {
    const timing = {
      totalMs: 300_000, activeMs: 100_000, idleMs: 200_000,
      steps: [{ stepId: 'a', title: 'Slow step', order: 1, durationMs: 200_000, activeMs: 200_000, idleMs: 0, appSwitchMs: 70_000, reworkMs: 5_000 }],
      bottleneckStepIds: [], highVariationStepIds: [],
    };
    const findings = [
      { kind: 'repeated', severity: 'medium', sopStepIndex: null, observedStepIndex: 1, evidenceScreenshotNumbers: [4], explanation: '', confidence: 0.6, recommendedAction: '' },
    ] as any;
    const withRate = generateRecommendations({ findings, timing, hourlyRateUsd: 60 });
    const noRate = generateRecommendations({ findings, timing });
    expect(withRate.some((r) => r.title.includes('duplicate'))).toBe(true);
    expect(withRate.some((r) => r.title.includes('application switching'))).toBe(true);
    expect(withRate.some((r) => r.title.includes('idle'))).toBe(true);
    // labor savings present only when a rate is supplied
    const dupWith = withRate.find((r) => r.title.includes('duplicate'))!;
    const dupNo = noRate.find((r) => r.title.includes('duplicate'))!;
    expect(dupWith.estimatedLaborSavingsUsd).not.toBeNull();
    expect(dupNo.estimatedLaborSavingsUsd).toBeNull();
  });
});

describe('reports', () => {
  const findings: Finding[] = [{
    id: 'f1', sessionId: 's', kind: 'skipped', severity: 'high', sopStepId: 'x', observedStepId: null,
    evidenceScreenshotNumbers: [3, 4], timestamp: null, explanation: 'Step "Verify" skipped.',
    confidence: 0.7, reviewStatus: 'unreviewed', recommendedAction: 'Confirm skip.',
  }];
  const ctx: ReportContext = {
    session: { id: 'ses', clientId: 'c', departmentId: 'd', processId: 'p', sopVersionId: null, participantLabel: 'A', auditorUserId: 'u', state: 'stopped', config: {} as any, startedAt: null, stoppedAt: null, pausedMs: 0, screenshotCount: 5, createdAt: '' },
    processName: 'Refund', clientName: 'Acme', screenshots: [], findings, recommendations: [],
    timing: null, complianceScore: 80, generatedAt: '2026-07-14T00:00:00Z',
  };

  it('emits valid JSON with evidence hashes', () => {
    const parsed = JSON.parse(auditReportJson({ ...ctx, screenshots: [{ number: 1, originalSha256: 'abc', triggerType: 'manual', redactionStatus: 'none', detectedSensitive: [] } as any] }));
    expect(parsed.report).toBe('audit');
    expect(parsed.complianceScore).toBe(80);
    expect(parsed.evidence[0].sha256).toBe('abc');
  });

  it('emits CSV with escaped cells', () => {
    const csv = findingsCsv(findings);
    expect(csv.split('\n')[0]).toContain('severity');
    expect(csv).toContain('skipped');
  });

  it('emits HTML that labels estimates and includes findings', () => {
    const html = auditReportHtml(ctx);
    expect(html).toContain('Process Audit Report');
    expect(html).toContain('estimates');
    expect(html).toContain('Step &quot;Verify&quot; skipped.');
  });
});
