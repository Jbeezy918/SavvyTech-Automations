import type { DeviationKind, Severity } from '@shared/types';

/**
 * Workflow-vs-SOP comparison (spec section 10).
 *
 * Uses a Longest-Common-Subsequence alignment over normalized step labels to
 * classify each SOP step and each observed step. Every finding is anchored to
 * evidence (observed step index → screenshot numbers) so no conclusion is vague.
 */

export interface ComparableStep {
  key: string; // normalized matching key (e.g. lowercased title)
  label: string;
  screenshotNumbers: number[];
  index: number;
}

export interface RawFinding {
  kind: DeviationKind;
  severity: Severity;
  sopStepIndex: number | null;
  observedStepIndex: number | null;
  evidenceScreenshotNumbers: number[];
  explanation: string;
  confidence: number;
  recommendedAction: string;
}

export function normalizeKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Greedy first-occurrence matching (NOT longest-common-subsequence): every SOP
 * step is matched to the earliest not-yet-used observed step with the same key.
 * Unlike LCS this keeps out-of-order steps *matched* (so they can be flagged as
 * out_of_order) instead of silently dropping them from the alignment.
 */
function matchSteps(sop: ComparableStep[], observed: ComparableStep[]): Array<[number, number]> {
  const usedObs = new Set<number>();
  const pairs: Array<[number, number]> = [];
  for (let si = 0; si < sop.length; si++) {
    for (let oi = 0; oi < observed.length; oi++) {
      if (usedObs.has(oi)) continue;
      if (observed[oi]!.key === sop[si]!.key) {
        usedObs.add(oi);
        pairs.push([si, oi]);
        break;
      }
    }
  }
  return pairs;
}

export function compareWorkflowToSop(sop: ComparableStep[], observed: ComparableStep[]): RawFinding[] {
  const findings: RawFinding[] = [];
  const matched = matchSteps(sop, observed);
  const matchedSop = new Set(matched.map((p) => p[0]));
  const matchedObs = new Set(matched.map((p) => p[1]));

  // Matched steps → completed.
  for (const [si, oi] of matched) {
    findings.push({
      kind: 'completed',
      severity: 'info',
      sopStepIndex: si,
      observedStepIndex: oi,
      evidenceScreenshotNumbers: observed[oi]!.screenshotNumbers,
      explanation: `SOP step "${sop[si]!.label}" was performed (observed step ${oi + 1}).`,
      confidence: 0.9,
      recommendedAction: 'No action required.',
    });
  }

  // SOP steps with no match → skipped.
  for (let si = 0; si < sop.length; si++) {
    if (matchedSop.has(si)) continue;
    findings.push({
      kind: 'skipped',
      severity: 'high',
      sopStepIndex: si,
      observedStepIndex: null,
      evidenceScreenshotNumbers: [],
      explanation: `SOP step "${sop[si]!.label}" has no matching observed action in the captured session.`,
      confidence: 0.7,
      recommendedAction: 'Confirm whether the step was skipped or performed without a captured screen.',
    });
  }

  // Observed steps with no match → undocumented, unless they are repeats.
  const seenKeys = new Map<string, number>();
  for (let oi = 0; oi < observed.length; oi++) {
    const key = observed[oi]!.key;
    const priorCount = seenKeys.get(key) ?? 0;
    seenKeys.set(key, priorCount + 1);
    if (matchedObs.has(oi)) continue;
    if (priorCount > 0) {
      findings.push({
        kind: 'repeated',
        severity: 'medium',
        sopStepIndex: null,
        observedStepIndex: oi,
        evidenceScreenshotNumbers: observed[oi]!.screenshotNumbers,
        explanation: `Observed step "${observed[oi]!.label}" repeats an earlier action (rework or duplicate entry).`,
        confidence: 0.6,
        recommendedAction: 'Investigate whether repeated entry can be eliminated or automated.',
      });
    } else {
      findings.push({
        kind: 'undocumented',
        severity: 'medium',
        sopStepIndex: null,
        observedStepIndex: oi,
        evidenceScreenshotNumbers: observed[oi]!.screenshotNumbers,
        explanation: `Observed step "${observed[oi]!.label}" is not present in the SOP.`,
        confidence: 0.6,
        recommendedAction: 'Decide whether to add this step to the SOP or eliminate it.',
      });
    }
  }

  // Out-of-order detection: walking matches in SOP order, observed indices
  // should never regress. A step whose observed position is earlier than a
  // previously-performed SOP step was done out of sequence.
  let maxObs = -1;
  for (let k = 0; k < matched.length; k++) {
    const [si, oi] = matched[k]!;
    if (oi < maxObs) {
      findings.push({
        kind: 'out_of_order',
        severity: 'medium',
        sopStepIndex: si,
        observedStepIndex: oi,
        evidenceScreenshotNumbers: observed[oi]!.screenshotNumbers,
        explanation: `SOP step "${sop[si]!.label}" was performed out of its documented sequence.`,
        confidence: 0.65,
        recommendedAction: 'Confirm whether ordering matters; update SOP or coach on sequence.',
      });
    } else {
      maxObs = oi;
    }
  }

  return findings;
}

export function complianceScore(findings: RawFinding[], sopStepCount: number): number {
  if (sopStepCount === 0) return 100;
  const completed = findings.filter((f) => f.kind === 'completed').length;
  const penalties = findings
    .filter((f) => f.kind === 'skipped' || f.kind === 'out_of_order')
    .reduce((a, f) => a + (f.kind === 'skipped' ? 1 : 0.5), 0);
  const raw = ((completed - penalties) / sopStepCount) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
