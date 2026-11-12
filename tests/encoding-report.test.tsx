import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('server-only', () => ({}));

import { EncodingReport } from '@/components/sheets/encoding-report';
import { summarizeReport } from '@/lib/grokbot/report-summary';
import { encodingState } from '@/lib/sheets/encoding';

const base = { error: null, updatedAt: '2026-11-12T08:00:00Z' };
const report = {
  verified: true, rows_written: 1, ranges: ['B8:O8'], before_balance: '38600.00', after_balance: '37200.00',
  audit_rows: 'A11:V13', warnings: ['Cleared stray cell K8'], completed_at: '2026-11-12T08:00:00Z',
};

describe('encodingState', () => {
  it('maps Grokbot operation status to four plain states', () => {
    expect(encodingState('completed', 'pending')).toBe('encoded');
    expect(encodingState(undefined, 'synced')).toBe('encoded');
    expect(encodingState('blocked', 'pending')).toBe('attention');
    expect(encodingState('failed', 'pending')).toBe('attention');
    expect(encodingState('running', 'pending')).toBe('encoding');
    expect(encodingState('queued', 'pending')).toBe('waiting');
    expect(encodingState(undefined, 'pending')).toBe('waiting');
  });
});

describe('EncodingReport', () => {
  it('shows where Grokbot wrote, the balance change, the notes and what was encoded', () => {
    const html = renderToStaticMarkup(
      <EncodingReport
        kind="liquidation"
        info={{ ...base, state: 'encoded', summary: summarizeReport(report) }}
        workbook="MAD Buying"
        worksheet="NOV-DEC 2026"
        sheetUrl="https://docs.google.com/spreadsheets/d/abc/edit#gid=1"
        entries={[{ particulars: 'Checking Docs', amount: 1400, category: 'NCE - FACILITATION' }]}
      />,
    );
    expect(html).toContain('Written to Google Sheets');
    expect(html).toContain('row 8');
    expect(html).toContain('₱38,600.00');
    expect(html).toContain('₱37,200.00');
    expect(html).toContain('A11:V13');
    expect(html).toContain('What was encoded');
    expect(html).toContain('Checking Docs');
    expect(html).toContain('Cleared stray cell K8');
    expect(html).toContain('range=B8');
  });

  it('explains a block in words and never claims it wrote anything', () => {
    const html = renderToStaticMarkup(
      <EncodingReport kind="liquidation" info={{ ...base, state: 'attention', error: 'Target rows were changed twice by staff', summary: summarizeReport(null) }} />,
    );
    expect(html).toContain('Needs attention');
    expect(html).toContain('Nothing was changed on the sheet');
    expect(html).toContain('Target rows were changed twice by staff');
    expect(html).not.toContain('Written to Google Sheets');
  });

  it('shows the green marker number for a replenishment', () => {
    const html = renderToStaticMarkup(
      <EncodingReport kind="marker" info={{ ...base, state: 'encoded', summary: summarizeReport({ ...report, replenishment_number: 2, ranges: ['B9:O9'] }) }} workbook="MAD Buying" />,
    );
    expect(html).toContain('PCF REPLENISHMENT #02');
  });

  it('does not offer links outside Google Sheets', () => {
    const html = renderToStaticMarkup(
      <EncodingReport kind="liquidation" info={{ ...base, state: 'encoded', summary: summarizeReport(report) }} sheetUrl="https://evil.example/x" />,
    );
    expect(html).not.toContain('evil.example');
  });
});
