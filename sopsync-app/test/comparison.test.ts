import { describe, it, expect } from 'vitest';
import { compareWorkflowToSop, complianceScore, normalizeKey, type ComparableStep } from '@main/analysis/comparison';

const step = (label: string, index: number, shots: number[] = []): ComparableStep => ({
  key: normalizeKey(label), label, index, screenshotNumbers: shots,
});

describe('workflow-vs-SOP comparison', () => {
  it('marks matched steps completed and links evidence', () => {
    const sop = [step('Open account', 0), step('Verify identity', 1), step('Submit', 2)];
    const obs = [step('Open account', 0, [1]), step('Verify identity', 1, [2]), step('Submit', 2, [3])];
    const findings = compareWorkflowToSop(sop, obs);
    const completed = findings.filter((f) => f.kind === 'completed');
    expect(completed).toHaveLength(3);
    expect(completed[0]!.evidenceScreenshotNumbers).toEqual([1]);
    expect(complianceScore(findings, sop.length)).toBe(100);
  });

  it('detects a skipped SOP step', () => {
    const sop = [step('Open account', 0), step('Verify identity', 1), step('Submit', 2)];
    const obs = [step('Open account', 0, [1]), step('Submit', 2, [2])];
    const findings = compareWorkflowToSop(sop, obs);
    const skipped = findings.filter((f) => f.kind === 'skipped');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.explanation).toContain('Verify identity');
    expect(complianceScore(findings, sop.length)).toBeLessThan(100);
  });

  it('detects undocumented and repeated observed steps', () => {
    const sop = [step('Open account', 0)];
    const obs = [step('Open account', 0, [1]), step('Extra approval', 1, [2]), step('Extra approval', 2, [3])];
    const findings = compareWorkflowToSop(sop, obs);
    expect(findings.some((f) => f.kind === 'undocumented')).toBe(true);
    expect(findings.some((f) => f.kind === 'repeated')).toBe(true);
  });

  it('detects out-of-order execution', () => {
    const sop = [step('A', 0), step('B', 1), step('C', 2)];
    const obs = [step('A', 0, [1]), step('C', 2, [2]), step('B', 1, [3])];
    const findings = compareWorkflowToSop(sop, obs);
    expect(findings.some((f) => f.kind === 'out_of_order')).toBe(true);
  });

  it('every finding carries a non-vague, evidence-referencing explanation', () => {
    const sop = [step('A', 0), step('B', 1)];
    const obs = [step('A', 0, [1]), step('Zed', 1, [2])];
    const findings = compareWorkflowToSop(sop, obs);
    for (const f of findings) {
      expect(f.explanation.length).toBeGreaterThan(10);
      expect(f.recommendedAction.length).toBeGreaterThan(3);
    }
  });
});
