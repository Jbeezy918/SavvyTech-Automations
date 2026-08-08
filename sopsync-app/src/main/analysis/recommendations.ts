import type { RawFinding } from './comparison';
import type { ProcessTiming } from './timing';

/**
 * Evidence-based recommendation generation (spec section 12).
 *
 * Rules fire ONLY from concrete findings and measured timings. Every savings
 * number is an ESTIMATE and is labeled as such by the UI; nothing here
 * fabricates dollar figures — labor savings are computed from measured time and
 * a caller-supplied hourly rate, or left null.
 */

export interface DraftRecommendation {
  title: string;
  problem: string;
  evidenceScreenshotNumbers: number[];
  currentImpactMs: number | null;
  proposedChange: string;
  estimatedTimeSavingsMs: number | null;
  estimatedLaborSavingsUsd: number | null;
  estimatedErrorReductionPct: number | null;
  implementationDifficulty: 'low' | 'medium' | 'high';
  risk: 'low' | 'medium' | 'high';
  confidence: number;
}

export interface RecommendationInputs {
  findings: RawFinding[];
  timing: ProcessTiming;
  hourlyRateUsd?: number; // optional; omit to leave labor savings null
}

function laborUsd(ms: number | null, rate?: number): number | null {
  if (ms == null || rate == null) return null;
  return Math.round((ms / 3_600_000) * rate * 100) / 100;
}

export function generateRecommendations(input: RecommendationInputs): DraftRecommendation[] {
  const recs: DraftRecommendation[] = [];
  const { findings, timing, hourlyRateUsd } = input;

  // 1. Repeated/duplicate entry → automate or eliminate.
  const repeats = findings.filter((f) => f.kind === 'repeated');
  if (repeats.length > 0) {
    const evidence = repeats.flatMap((f) => f.evidenceScreenshotNumbers);
    const reworkMs = timing.steps.reduce((a, s) => a + s.reworkMs, 0) || null;
    recs.push({
      title: 'Eliminate duplicate/repeated data entry',
      problem: `${repeats.length} repeated action(s) were observed, indicating duplicate entry or rework.`,
      evidenceScreenshotNumbers: evidence,
      currentImpactMs: reworkMs,
      proposedChange: 'Introduce copy-forward, pre-fill, or system integration so the data is entered once.',
      estimatedTimeSavingsMs: reworkMs,
      estimatedLaborSavingsUsd: laborUsd(reworkMs, hourlyRateUsd),
      estimatedErrorReductionPct: 20,
      implementationDifficulty: 'medium',
      risk: 'low',
      confidence: 0.6,
    });
  }

  // 2. Bottleneck steps → investigate / redesign.
  for (const stepId of timing.bottleneckStepIds) {
    const step = timing.steps.find((s) => s.stepId === stepId);
    if (!step) continue;
    recs.push({
      title: `Reduce time in bottleneck step: ${step.title}`,
      problem: `Step "${step.title}" takes ${Math.round(step.durationMs / 1000)}s, well above the process average.`,
      evidenceScreenshotNumbers: [],
      currentImpactMs: step.durationMs,
      proposedChange: 'Simplify the form, add validation, or automate the slow portion of this step.',
      estimatedTimeSavingsMs: Math.round(step.durationMs * 0.3),
      estimatedLaborSavingsUsd: laborUsd(Math.round(step.durationMs * 0.3), hourlyRateUsd),
      estimatedErrorReductionPct: null,
      implementationDifficulty: 'medium',
      risk: 'medium',
      confidence: 0.5,
    });
  }

  // 3. Excessive app switching → consolidate systems.
  const switchMs = timing.steps.reduce((a, s) => a + s.appSwitchMs, 0);
  if (switchMs > 60_000) {
    recs.push({
      title: 'Reduce application switching',
      problem: `~${Math.round(switchMs / 1000)}s was spent switching between applications.`,
      evidenceScreenshotNumbers: [],
      currentImpactMs: switchMs,
      proposedChange: 'Integrate the systems or provide a single consolidated view to remove context switching.',
      estimatedTimeSavingsMs: Math.round(switchMs * 0.5),
      estimatedLaborSavingsUsd: laborUsd(Math.round(switchMs * 0.5), hourlyRateUsd),
      estimatedErrorReductionPct: null,
      implementationDifficulty: 'high',
      risk: 'medium',
      confidence: 0.45,
    });
  }

  // 4. Skipped steps → training or SOP clarification.
  const skipped = findings.filter((f) => f.kind === 'skipped');
  if (skipped.length > 0) {
    recs.push({
      title: 'Address skipped SOP steps',
      problem: `${skipped.length} SOP step(s) had no matching observed action.`,
      evidenceScreenshotNumbers: [],
      currentImpactMs: null,
      proposedChange: 'Clarify the SOP and provide targeted training on the missing steps.',
      estimatedTimeSavingsMs: null,
      estimatedLaborSavingsUsd: null,
      estimatedErrorReductionPct: 15,
      implementationDifficulty: 'low',
      risk: 'low',
      confidence: 0.55,
    });
  }

  // 5. High idle → investigate waiting/handoffs.
  if (timing.idleMs > 120_000) {
    recs.push({
      title: 'Investigate idle / waiting time',
      problem: `~${Math.round(timing.idleMs / 1000)}s of idle time suggests waiting on systems, approvals, or handoffs.`,
      evidenceScreenshotNumbers: [],
      currentImpactMs: timing.idleMs,
      proposedChange: 'Identify the wait source and remove unnecessary approvals or parallelize handoffs.',
      estimatedTimeSavingsMs: Math.round(timing.idleMs * 0.4),
      estimatedLaborSavingsUsd: laborUsd(Math.round(timing.idleMs * 0.4), hourlyRateUsd),
      estimatedErrorReductionPct: null,
      implementationDifficulty: 'medium',
      risk: 'low',
      confidence: 0.4,
    });
  }

  return recs;
}
