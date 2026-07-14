import type { CaptureEvent, WorkflowStep } from '@shared/types';

/**
 * Timing & process analysis (spec section 11). All durations are derived from
 * recorded event timestamps and elapsed (active) time — never invented.
 */

export interface StepTiming {
  stepId: string;
  title: string;
  order: number;
  durationMs: number;
  activeMs: number;
  idleMs: number;
  appSwitchMs: number;
  reworkMs: number;
}

export interface ProcessTiming {
  totalMs: number;
  activeMs: number;
  idleMs: number;
  steps: StepTiming[];
  bottleneckStepIds: string[];
  highVariationStepIds: string[];
}

const IDLE_THRESHOLD_MS = 30_000;

/**
 * Attribute event intervals to their workflow step (by the step owning the
 * screenshot at the start of the interval) and classify each interval.
 */
export function computeProcessTiming(
  events: CaptureEvent[],
  steps: WorkflowStep[],
  screenshotStepIndex: Map<string, string>, // screenshotId -> stepId
): ProcessTiming {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const acc = new Map<string, StepTiming>();
  const ensure = (stepId: string): StepTiming => {
    let t = acc.get(stepId);
    if (!t) {
      const s = stepById.get(stepId);
      t = {
        stepId,
        title: s?.title ?? 'Unassigned',
        order: s?.order ?? 999,
        durationMs: 0, activeMs: 0, idleMs: 0, appSwitchMs: 0, reworkMs: 0,
      };
      acc.set(stepId, t);
    }
    return t;
  };

  let currentStep: string | null = null;
  let totalMs = 0;
  let idleMs = 0;
  let activeMs = 0;
  const seenScreens = new Set<string>();

  for (let i = 0; i < ordered.length; i++) {
    const ev = ordered[i]!;
    if (ev.screenshotId && screenshotStepIndex.has(ev.screenshotId)) {
      currentStep = screenshotStepIndex.get(ev.screenshotId)!;
    }
    const next = ordered[i + 1];
    if (!next) continue;
    const gap = Math.max(0, next.elapsedMs - ev.elapsedMs);
    totalMs += gap;
    const t = currentStep ? ensure(currentStep) : null;
    if (t) t.durationMs += gap;

    const isIdle = gap >= IDLE_THRESHOLD_MS || ev.type === 'idle_start';
    if (isIdle) {
      idleMs += gap;
      if (t) t.idleMs += gap;
    } else {
      activeMs += gap;
      if (t) t.activeMs += gap;
    }
    if (next.type === 'app_change') {
      if (t) t.appSwitchMs += gap;
    }
    // Rework heuristic: revisiting a screenshot's screen state we already passed.
    if (ev.screenshotId) {
      if (seenScreens.has(ev.screenshotId) && t) t.reworkMs += gap;
      seenScreens.add(ev.screenshotId);
    }
  }

  const stepTimings = [...acc.values()].sort((a, b) => a.order - b.order);
  return {
    totalMs,
    activeMs,
    idleMs,
    steps: stepTimings,
    bottleneckStepIds: findBottlenecks(stepTimings),
    highVariationStepIds: [],
  };
}

/** A step is a bottleneck if its duration exceeds mean + 1 stddev of all steps. */
export function findBottlenecks(steps: StepTiming[]): string[] {
  if (steps.length < 2) return [];
  const durations = steps.map((s) => s.durationMs);
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = durations.reduce((a, b) => a + (b - mean) ** 2, 0) / durations.length;
  const std = Math.sqrt(variance);
  return steps.filter((s) => s.durationMs > mean + std).map((s) => s.stepId);
}

export interface ExecutionStats {
  count: number;
  fastestMs: number;
  slowestMs: number;
  medianMs: number;
  averageMs: number;
}

/** Aggregate multiple executions of the same process (spec: fastest/slowest/median). */
export function executionStats(totals: number[]): ExecutionStats | null {
  if (totals.length === 0) return null;
  const sorted = [...totals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return {
    count: sorted.length,
    fastestMs: sorted[0]!,
    slowestMs: sorted[sorted.length - 1]!,
    medianMs: median,
    averageMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  };
}

/** Identify steps whose duration varies widely across executions (CoV > 0.5). */
export function highVariationSteps(perStep: Map<string, number[]>): string[] {
  const out: string[] = [];
  for (const [stepId, vals] of perStep) {
    if (vals.length < 2) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (mean === 0) continue;
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    if (std / mean > 0.5) out.push(stepId);
  }
  return out;
}
