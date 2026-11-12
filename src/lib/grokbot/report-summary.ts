// Turns the report Grokbot sends back into plain facts the app can show.
// Everything is read defensively: the report is data from outside the app.

export type EncodingSummary = {
  verified: boolean;
  rowsWritten: number | null;
  ranges: string[];
  sheetRows: number[];
  before: string | null;
  after: string | null;
  inAmount: string | null;
  outAmount: string | null;
  auditRows: string | null;
  warnings: string[];
  completedAt: string | null;
  replenishmentNumber: number | null;
};

const text = (value: unknown, max = 300) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const money = (value: unknown) =>
  typeof value === "string" && /^-?\d{1,10}(\.\d{1,2})?$/.test(value) ? value : null;

// "B8:O9" -> [8, 9]; "B8:O8" -> [8]
export function rowsFromRange(range: string): number[] {
  const match = /^[A-Z]{1,3}(\d{1,5})(?::[A-Z]{1,3}(\d{1,5}))?$/.exec(range.trim());
  if (!match) return [];
  const first = Number(match[1]);
  const last = match[2] ? Number(match[2]) : first;
  if (last < first || last - first > 200) return [];
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function summarizeReport(report: unknown): EncodingSummary {
  const data = report && typeof report === "object" && !Array.isArray(report)
    ? (report as Record<string, unknown>)
    : {};
  const ranges = Array.isArray(data.ranges)
    ? data.ranges.map((range) => text(range, 40)).filter((range): range is string => range !== null).slice(0, 20)
    : [];
  const sheetRows = [...new Set(ranges.flatMap(rowsFromRange))].sort((a, b) => a - b);
  const warnings = Array.isArray(data.warnings)
    ? data.warnings.map((warning) => text(warning, 400)).filter((warning): warning is string => warning !== null).slice(0, 20)
    : [];
  return {
    verified: data.verified === true,
    rowsWritten: typeof data.rows_written === "number" && Number.isInteger(data.rows_written) ? data.rows_written : null,
    ranges,
    sheetRows,
    before: money(data.before_balance),
    after: money(data.after_balance),
    inAmount: money(data.in_amount),
    outAmount: money(data.out_amount),
    auditRows: typeof data.audit_rows === "string" && /^A\d+:V\d+$/.test(data.audit_rows) ? data.audit_rows : null,
    warnings,
    completedAt: typeof data.completed_at === "string" && !Number.isNaN(Date.parse(data.completed_at)) ? data.completed_at : null,
    replenishmentNumber: typeof data.replenishment_number === "number" && Number.isInteger(data.replenishment_number) ? data.replenishment_number : null,
  };
}

export function describeRows(rows: number[]) {
  if (rows.length === 0) return null;
  if (rows.length === 1) return `row ${rows[0]}`;
  const consecutive = rows.every((row, index) => index === 0 || row === rows[index - 1] + 1);
  return consecutive ? `rows ${rows[0]}–${rows[rows.length - 1]}` : `rows ${rows.join(", ")}`;
}
