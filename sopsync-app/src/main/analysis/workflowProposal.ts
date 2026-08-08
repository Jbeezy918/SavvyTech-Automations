import type { ScreenState } from '@shared/types';

/**
 * AI screenshot organization → proposed workflow (spec section 8).
 *
 * This is a deterministic, evidence-grounded proposer. It NEVER invents actions:
 * every proposed step is backed by real captured screenshots. Grouping is driven
 * by (a) duplicate clusters (repeated input collapses to one step) and (b)
 * screen-state transitions (empty → partial → completed marks step boundaries).
 * Low-signal groupings are flagged `needsHumanReview`. The reviewer must approve
 * before this becomes an official workflow — enforced upstream in the DB layer.
 */

export interface ShotForProposal {
  id: string;
  number: number;
  clusterId: string | null;
  screenState: ScreenState;
  activeApp: string | null;
  windowTitle: string | null;
}

export interface ProposedStep {
  title: string;
  description: string;
  memberScreenshotIds: string[];
  representativeScreenshotId: string;
  confidence: number;
  needsHumanReview: boolean;
}

const NEW_STEP_ON: ReadonlySet<ScreenState> = new Set(['empty_form', 'confirmation']);

export function proposeWorkflow(shots: ShotForProposal[]): ProposedStep[] {
  const steps: ProposedStep[] = [];
  let current: ShotForProposal[] = [];
  let currentAppKey: string | null = null;

  const boundary = (shot: ShotForProposal, prev: ShotForProposal | null): boolean => {
    if (!prev) return false;
    // App change is a strong boundary signal.
    const appKey = shot.activeApp ?? null;
    if (appKey !== currentAppKey) return true;
    // A form returning to empty, or a confirmation screen, starts a new step.
    if (NEW_STEP_ON.has(shot.screenState) && shot.screenState !== prev.screenState) return true;
    return false;
  };

  const flush = () => {
    if (current.length === 0) return;
    steps.push(buildStep(current, steps.length + 1));
    current = [];
  };

  let prev: ShotForProposal | null = null;
  for (const shot of shots) {
    if (boundary(shot, prev)) flush();
    if (current.length === 0) currentAppKey = shot.activeApp ?? null;
    current.push(shot);
    prev = shot;
  }
  flush();
  return steps;
}

function buildStep(members: ShotForProposal[], order: number): ProposedStep {
  // Representative = the most "complete" state available (completed > confirmation
  // > partial > empty > unknown), else the first captured.
  const rank: Record<ScreenState, number> = {
    completed_state: 5, confirmation: 4, partial_entry: 3, empty_form: 2, unknown: 1,
  };
  const rep = [...members].sort((a, b) => rank[b.screenState] - rank[a.screenState])[0]!;
  const app = rep.activeApp ?? 'application';
  const distinctClusters = new Set(members.map((m) => m.clusterId ?? m.id)).size;
  // Confidence: fewer distinct screens + a clear completed state = higher.
  let confidence = 0.5;
  if (members.some((m) => m.screenState === 'completed_state')) confidence += 0.2;
  // Only reward cluster cohesion for multi-shot steps; a single ambiguous
  // screenshot stays low-confidence and is routed to human review.
  if (distinctClusters === 1 && members.length > 1) confidence += 0.2;
  confidence = Math.min(0.95, confidence);
  return {
    title: `Work in ${app}`,
    description:
      `Observed ${members.length} screenshot(s) (${members.map((m) => m.number).join(', ')}) in ${app}. ` +
      `This step is a proposal based on captured evidence and requires reviewer approval.`,
    memberScreenshotIds: members.map((m) => m.id),
    representativeScreenshotId: rep.id,
    confidence,
    needsHumanReview: confidence < 0.7,
  };
}
