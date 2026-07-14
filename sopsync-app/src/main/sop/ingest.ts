/**
 * SOP ingestion (spec section 9).
 *
 * This module contains the format-independent PARSER that turns already-extracted
 * plain text (from markdown/txt directly, or from PDF/DOCX/OCR upstream) into a
 * structured SOP. Binary extraction (PDF/DOCX/image OCR) is delegated to adapters
 * so the parsing logic stays pure and testable.
 */

export interface ParsedSopStep {
  stepNumber: number;
  title: string;
  description: string;
  warnings: string[];
  isDecisionPoint: boolean;
  expectedOutput: string | null;
}

export interface ParsedSop {
  title: string | null;
  version: string | null;
  effectiveDate: string | null;
  owner: string | null;
  department: string | null;
  purpose: string | null;
  preconditions: string[];
  requiredSystems: string[];
  requiredForms: string[];
  steps: ParsedSopStep[];
  warnings: string[];
  references: string[];
}

const META_PATTERNS: Array<[keyof ParsedSop, RegExp]> = [
  ['title', /^#?\s*(?:sop\s+)?title\s*[:\-]\s*(.+)$/i],
  ['version', /^\s*version\s*[:\-]\s*(.+)$/i],
  ['effectiveDate', /^\s*effective\s+date\s*[:\-]\s*(.+)$/i],
  ['owner', /^\s*owner\s*[:\-]\s*(.+)$/i],
  ['department', /^\s*department\s*[:\-]\s*(.+)$/i],
  ['purpose', /^\s*purpose\s*[:\-]\s*(.+)$/i],
];

const LIST_SECTIONS: Array<[keyof ParsedSop, RegExp]> = [
  ['preconditions', /^\s*preconditions?\s*[:\-]?\s*$/i],
  ['requiredSystems', /^\s*required\s+systems?\s*[:\-]?\s*$/i],
  ['requiredForms', /^\s*required\s+forms?\s*[:\-]?\s*$/i],
  ['references', /^\s*references?\s*[:\-]?\s*$/i],
];

const STEP_LINE = /^\s*(?:step\s+)?(\d+)[.)]\s+(.+)$/i;
const WARNING_LINE = /^\s*(?:warning|caution|note)\s*[:\-]\s*(.+)$/i;
const DECISION_HINT = /\b(if|decide|choose|whether|otherwise|depending)\b/i;
const OUTPUT_LINE = /^\s*(?:expected\s+)?output\s*[:\-]\s*(.+)$/i;
const BULLET = /^\s*[-*•]\s+(.+)$/;

export function parseSopText(text: string): ParsedSop {
  const lines = text.split(/\r?\n/);
  const sop: ParsedSop = {
    title: null, version: null, effectiveDate: null, owner: null, department: null,
    purpose: null, preconditions: [], requiredSystems: [], requiredForms: [],
    steps: [], warnings: [], references: [],
  };

  let listTarget: keyof ParsedSop | null = null;
  let currentStep: ParsedSopStep | null = null;

  const flushStep = () => {
    if (currentStep) sop.steps.push(currentStep);
    currentStep = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.trim() === '') { listTarget = null; continue; }

    // Metadata key:value lines.
    let matchedMeta = false;
    for (const [key, re] of META_PATTERNS) {
      const m = line.match(re);
      if (m && (sop as unknown as Record<string, unknown>)[key] == null) {
        (sop as unknown as Record<string, unknown>)[key] = m[1]!.trim();
        matchedMeta = true;
        break;
      }
    }
    if (matchedMeta) { listTarget = null; continue; }

    // Section headers that begin a bulleted list.
    const sect = LIST_SECTIONS.find(([, re]) => re.test(line));
    if (sect) { listTarget = sect[0]; flushStep(); continue; }

    // Numbered step.
    const stepMatch = line.match(STEP_LINE);
    if (stepMatch) {
      flushStep();
      listTarget = null;
      const title = stepMatch[2]!.trim();
      currentStep = {
        stepNumber: parseInt(stepMatch[1]!, 10),
        title,
        description: title,
        warnings: [],
        isDecisionPoint: DECISION_HINT.test(title),
        expectedOutput: null,
      };
      continue;
    }

    // Warning line — attach to current step or global.
    const warn = line.match(WARNING_LINE);
    if (warn) {
      if (currentStep) currentStep.warnings.push(warn[1]!.trim());
      else sop.warnings.push(warn[1]!.trim());
      continue;
    }

    // Expected output for current step.
    const out = line.match(OUTPUT_LINE);
    if (out && currentStep) { currentStep.expectedOutput = out[1]!.trim(); continue; }

    // Bulleted item under an active list section.
    const bullet = line.match(BULLET);
    if (bullet && listTarget) {
      (sop[listTarget] as string[]).push(bullet[1]!.trim());
      continue;
    }

    // Continuation of a step description.
    if (currentStep) {
      currentStep.description += ' ' + line.trim();
      if (DECISION_HINT.test(line)) currentStep.isDecisionPoint = true;
    }
  }
  flushStep();

  // Renumber sequentially to guarantee 1..N ordering even if source skipped numbers.
  sop.steps.forEach((s, i) => (s.stepNumber = i + 1));
  return sop;
}
