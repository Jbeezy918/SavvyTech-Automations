import type { SensitiveKind } from '@shared/types';

/**
 * Sensitive-information detection over OCR/window text.
 *
 * This module NEVER receives raw keystrokes — it operates on text that the
 * capture layer already decided is safe to inspect (window titles when
 * authorized, or OCR of a screenshot). It returns the KINDS of sensitive data
 * found and their character spans so the redaction tool can mask them on a
 * DERIVED image. Originals are never altered here.
 */

export interface DetectedSpan {
  kind: SensitiveKind;
  start: number;
  end: number;
  value: string; // matched substring, used only to compute the mask box
}

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// US SSN with separators, avoiding obviously-invalid all-zero groups.
const SSN = /\b(?!000|666|9\d\d)\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g;
// 13-19 digit runs allowing spaces/dashes — validated with Luhn below.
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;
const PHONE = /\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/g;
const MEDICAL = /\b(diagnosis|prescription|patient|mrn|icd-?10|medication|dosage)\b/gi;

/** Luhn check — used to avoid flagging arbitrary long digit strings as cards. */
export function luhnValid(digits: string): boolean {
  const only = digits.replace(/\D/g, '');
  if (only.length < 13 || only.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = only.length - 1; i >= 0; i--) {
    let d = only.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function collect(re: RegExp, text: string, kind: SensitiveKind, out: DetectedSpan[], validate?: (v: string) => boolean) {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = m[0];
    if (validate && !validate(value)) continue;
    out.push({ kind, start: m.index, end: m.index + value.length, value });
  }
}

export function detectSensitive(text: string, enabled: SensitiveKind[]): DetectedSpan[] {
  const on = new Set(enabled);
  const spans: DetectedSpan[] = [];
  if (on.has('email')) collect(EMAIL, text, 'email', spans);
  if (on.has('ssn')) collect(SSN, text, 'ssn', spans);
  if (on.has('card')) collect(CARD_CANDIDATE, text, 'card', spans, luhnValid);
  if (on.has('phone')) collect(PHONE, text, 'phone', spans);
  if (on.has('medical')) collect(MEDICAL, text, 'medical', spans);
  // De-duplicate overlapping spans, preferring the more specific / earlier kind.
  spans.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const result: DetectedSpan[] = [];
  for (const s of spans) {
    if (result.some((r) => s.start < r.end && s.end > r.start)) continue;
    result.push(s);
  }
  return result;
}

export function distinctKinds(spans: DetectedSpan[]): SensitiveKind[] {
  return [...new Set(spans.map((s) => s.kind))];
}
