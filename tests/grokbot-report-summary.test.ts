import { describe, expect, it } from 'vitest';

import { describeRows, rowsFromRange, summarizeReport } from '@/lib/grokbot/report-summary';
import { isBookOpen } from '@/lib/sheets/open-books';

describe('summarizeReport', () => {
  const report = {
    verified: true,
    rows_written: 2,
    ranges: ['B8:O9'],
    before_balance: '38600.00',
    after_balance: '36600.00',
    in_amount: '0.00',
    out_amount: '2000.00',
    audit_rows: 'A11:V13',
    warnings: ['Cleared stray cell K8', '  '],
    completed_at: '2026-11-12T08:00:00Z',
    replenishment_number: null,
  };

  it('reads the facts people want to see', () => {
    const summary = summarizeReport(report);
    expect(summary).toMatchObject({
      verified: true, rowsWritten: 2, sheetRows: [8, 9], before: '38600.00', after: '36600.00',
      outAmount: '2000.00', auditRows: 'A11:V13', warnings: ['Cleared stray cell K8'],
    });
    expect(describeRows(summary.sheetRows)).toBe('rows 8–9');
  });

  it('ignores junk instead of trusting it', () => {
    const summary = summarizeReport({ verified: 'yes', rows_written: '2', ranges: ['not a range', 5], before_balance: '1e9', audit_rows: 'Z1:Z2', completed_at: 'soon', warnings: 'x' });
    expect(summary).toMatchObject({ verified: false, rowsWritten: null, sheetRows: [], before: null, auditRows: null, completedAt: null, warnings: [] });
    expect(summarizeReport(null).warnings).toEqual([]);
    expect(summarizeReport([1, 2]).rowsWritten).toBeNull();
  });

  it('expands ranges safely', () => {
    expect(rowsFromRange('B7:O7')).toEqual([7]);
    expect(rowsFromRange('N12')).toEqual([12]);
    expect(rowsFromRange('B9:O7')).toEqual([]);
    expect(rowsFromRange('B1:O9999')).toEqual([]);
    expect(describeRows([7, 9])).toBe('rows 7, 9');
    expect(describeRows([])).toBeNull();
  });
});

describe('open workbooks', () => {
  it('opens only the workbooks that have their own Grokbot (MAD Buying and DRYVE)', () => {
    for (const id of ['buying', 'dryve']) expect(isBookOpen(id)).toBe(true);
    for (const id of ['operations', 'selling', 'lmr', '']) expect(isBookOpen(id)).toBe(false);
  });
});
