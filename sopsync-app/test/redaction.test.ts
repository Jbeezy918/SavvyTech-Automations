import { describe, it, expect } from 'vitest';
import { detectSensitive, luhnValid, distinctKinds } from '@main/security/redaction';

describe('sensitive-data detection', () => {
  it('validates card numbers with Luhn (rejects invalid)', () => {
    expect(luhnValid('4111 1111 1111 1111')).toBe(true); // valid test Visa
    expect(luhnValid('4111 1111 1111 1112')).toBe(false);
    expect(luhnValid('1234 5678 9012 3456')).toBe(false);
  });

  it('detects email, SSN, phone, and valid card — not random digit runs', () => {
    const text = 'Contact jane.doe@example.com SSN 123-45-6789 call 415-555-0132 card 4111 1111 1111 1111 ref 9999 0000 0000 0001';
    const spans = detectSensitive(text, ['email', 'ssn', 'phone', 'card']);
    const kinds = distinctKinds(spans);
    expect(kinds).toContain('email');
    expect(kinds).toContain('ssn');
    expect(kinds).toContain('phone');
    expect(kinds).toContain('card');
    // The trailing 16-digit run fails Luhn and must NOT be flagged as a card.
    const cardValues = spans.filter((s) => s.kind === 'card').map((s) => s.value.replace(/\D/g, ''));
    expect(cardValues).toContain('4111111111111111');
    expect(cardValues).not.toContain('9999000000000001');
  });

  it('only reports the kinds that are enabled', () => {
    const spans = detectSensitive('a@b.com 123-45-6789', ['email']);
    expect(distinctKinds(spans)).toEqual(['email']);
  });

  it('does not flag an invalid all-zero SSN group', () => {
    const spans = detectSensitive('000-12-3456 and 123-45-6789', ['ssn']);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.value).toBe('123-45-6789');
  });
});
