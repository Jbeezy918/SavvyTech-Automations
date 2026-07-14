import { describe, it, expect } from 'vitest';
import { parseSopText } from '@main/sop/ingest';

const SAMPLE = `Title: Customer Refund Process
Version: 2.1
Effective Date: 2026-01-15
Owner: Finance Team
Department: Accounts Receivable
Purpose: Standardize how refunds are issued.

Preconditions:
- Customer has a valid order
- Refund is approved by supervisor

Required Systems:
- Billing Portal
- Email

1. Open the Billing Portal and locate the order.
2. Verify the refund amount matches the approved request.
   Warning: Do not exceed the approved amount.
3. If the amount is over $500, decide whether escalation is needed.
4. Submit the refund and record the confirmation number.
   Expected Output: Confirmation number saved to the order.

References:
- Finance Policy 12.4
`;

describe('SOP ingestion parser', () => {
  it('extracts metadata', () => {
    const sop = parseSopText(SAMPLE);
    expect(sop.title).toBe('Customer Refund Process');
    expect(sop.version).toBe('2.1');
    expect(sop.effectiveDate).toBe('2026-01-15');
    expect(sop.owner).toBe('Finance Team');
    expect(sop.department).toBe('Accounts Receivable');
    expect(sop.purpose).toContain('Standardize');
  });

  it('extracts list sections', () => {
    const sop = parseSopText(SAMPLE);
    expect(sop.preconditions).toHaveLength(2);
    expect(sop.requiredSystems).toContain('Billing Portal');
    expect(sop.references).toContain('Finance Policy 12.4');
  });

  it('extracts numbered steps and renumbers sequentially', () => {
    const sop = parseSopText(SAMPLE);
    expect(sop.steps).toHaveLength(4);
    expect(sop.steps.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4]);
    expect(sop.steps[0]!.title).toContain('Billing Portal');
  });

  it('captures warnings, decision points, and expected outputs', () => {
    const sop = parseSopText(SAMPLE);
    expect(sop.steps[1]!.warnings.join(' ')).toContain('exceed');
    expect(sop.steps[2]!.isDecisionPoint).toBe(true); // "If ... decide"
    expect(sop.steps[3]!.expectedOutput).toContain('Confirmation number');
  });
});
