import { describe, it, expect } from 'vitest';
import { computeProcessTiming, executionStats, findBottlenecks, highVariationSteps, type StepTiming } from '@main/analysis/timing';
import type { CaptureEvent, WorkflowStep } from '@shared/types';

function ev(seq: number, elapsedMs: number, screenshotId: string | null, type: CaptureEvent['type'] = 'mouse_click'): CaptureEvent {
  return {
    id: `e${seq}`, sessionId: 's', sequence: seq, type, timestamp: new Date(elapsedMs).toISOString(),
    elapsedMs, sincePrevMs: 0, activeApp: 'App', windowTitle: null, monitorId: 1, navKey: null, screenshotId,
  };
}

describe('timing analysis', () => {
  it('attributes durations to steps and separates idle from active', () => {
    const steps: WorkflowStep[] = [
      { id: 'st1', workflowVersionId: 'v', order: 1, title: 'Step 1', description: '', memberScreenshotIds: [], representativeScreenshotId: null, confidence: 1, needsHumanReview: false, durationMs: null },
      { id: 'st2', workflowVersionId: 'v', order: 2, title: 'Step 2', description: '', memberScreenshotIds: [], representativeScreenshotId: null, confidence: 1, needsHumanReview: false, durationMs: null },
    ];
    const map = new Map([['sh1', 'st1'], ['sh2', 'st2']]);
    const events = [
      ev(1, 0, 'sh1'),
      ev(2, 5_000, null),          // 5s active in step 1
      ev(3, 10_000, 'sh2'),        // moves to step 2
      ev(4, 100_000, null, 'idle_start'), // 90s gap → idle in step 2
      ev(5, 105_000, null),
    ];
    const t = computeProcessTiming(events, steps, map);
    expect(t.totalMs).toBe(105_000);
    const s1 = t.steps.find((s) => s.stepId === 'st1')!;
    const s2 = t.steps.find((s) => s.stepId === 'st2')!;
    expect(s1.activeMs).toBe(10_000); // 0→5s and 5→10s both active
    expect(s2.idleMs).toBeGreaterThanOrEqual(90_000);
  });

  it('finds bottleneck steps above mean+stddev', () => {
    const steps: StepTiming[] = [
      { stepId: 'a', title: 'a', order: 1, durationMs: 1000, activeMs: 1000, idleMs: 0, appSwitchMs: 0, reworkMs: 0 },
      { stepId: 'b', title: 'b', order: 2, durationMs: 1000, activeMs: 1000, idleMs: 0, appSwitchMs: 0, reworkMs: 0 },
      { stepId: 'c', title: 'c', order: 3, durationMs: 20000, activeMs: 20000, idleMs: 0, appSwitchMs: 0, reworkMs: 0 },
    ];
    expect(findBottlenecks(steps)).toEqual(['c']);
  });

  it('computes fastest/slowest/median/average across executions', () => {
    const stats = executionStats([10, 20, 30, 40])!;
    expect(stats.fastestMs).toBe(10);
    expect(stats.slowestMs).toBe(40);
    expect(stats.medianMs).toBe(25);
    expect(stats.averageMs).toBe(25);
    expect(executionStats([])).toBeNull();
  });

  it('flags high-variation steps (CoV > 0.5)', () => {
    const perStep = new Map([['stable', [100, 105, 95]], ['volatile', [10, 500, 20]]]);
    expect(highVariationSteps(perStep)).toEqual(['volatile']);
  });
});
