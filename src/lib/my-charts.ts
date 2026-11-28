import { formatInTimeZone } from "date-fns-tz";

const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "Asia/Manila";

// What the dashboard charts are made of. The loader fills these in; the components only draw them.
export type Unit = "money" | "count" | "hours" | "days" | "percent";
export type Kpi = { label: string; value: number | null; unit: Unit; hint?: string };
export type ColumnsSpec = { kind: "columns"; title: string; description: string; unit: Unit; points: { label: string; value: number; full: string }[] };
export type PairedSpec = {
  kind: "paired";
  title: string;
  description: string;
  unit: Unit;
  a: string;
  b: string;
  points: { label: string; full: string; a: number; b: number }[];
};
export type BarsSpec = { kind: "bars"; title: string; description: string; unit: Unit; rows: { label: string; value: number }[]; empty: string };
export type ChartSpec = ColumnsSpec | PairedSpec | BarsSpec;
export type MyCharts = { heading: string; description: string; kpis: Kpi[]; charts: ChartSpec[] };

export const CHART_MONTHS = 6;

export function monthKey(iso: string): string {
  return formatInTimeZone(new Date(iso), APP_TIMEZONE, "yyyy-MM");
}

// The last `count` month keys ("2026-11"), oldest first, counting the current month.
export function lastMonths(count: number, now = new Date()): string[] {
  const [year, month] = formatInTimeZone(now, APP_TIMEZONE, "yyyy-MM").split("-").map(Number);
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const index = year * 12 + (month - 1) - back;
    keys.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`);
  }
  return keys;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortMonth = (key: string) => MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? key;
export const fullMonth = (key: string) => `${shortMonth(key)} ${key.slice(0, 4)}`;

// Add up values per month. Rows outside the months shown, or without a date, are left out.
export function sumByMonth<T>(rows: readonly T[], months: readonly string[], date: (row: T) => string | null | undefined, value: (row: T) => number): number[] {
  const totals = new Map(months.map((key) => [key, 0]));
  for (const row of rows) {
    const when = date(row);
    if (!when) continue;
    const key = monthKey(when);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + value(row));
  }
  return months.map((key) => Math.round((totals.get(key) ?? 0) * 100) / 100);
}

// Group by a label and add up; largest first, the tail folded into "Other".
export function topWithOther(entries: readonly { label: string; value: number }[], keep = 6): { label: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const entry of entries) totals.set(entry.label, (totals.get(entry.label) ?? 0) + entry.value);
  const sorted = [...totals.entries()].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
  if (sorted.length <= keep) return sorted;
  const rest = sorted.slice(keep - 1).reduce((sum, row) => sum + row.value, 0);
  return [...sorted.slice(0, keep - 1), { label: "Other", value: Math.round(rest * 100) / 100 }];
}

export const AGE_BUCKETS = ["Today or yesterday", "2 to 3 days", "4 to 7 days", "Over a week"] as const;
export function ageBucket(days: number): (typeof AGE_BUCKETS)[number] {
  if (days < 2) return AGE_BUCKETS[0];
  if (days < 4) return AGE_BUCKETS[1];
  if (days <= 7) return AGE_BUCKETS[2];
  return AGE_BUCKETS[3];
}

export function averageBetween(pairs: readonly { from: string | null | undefined; to: string | null | undefined }[], unitMs: number): number | null {
  const spans = pairs
    .filter((pair) => pair.from && pair.to)
    .map((pair) => (Date.parse(pair.to as string) - Date.parse(pair.from as string)) / unitMs)
    .filter((span) => Number.isFinite(span) && span >= 0);
  if (spans.length === 0) return null;
  return Math.round((spans.reduce((sum, span) => sum + span, 0) / spans.length) * 10) / 10;
}
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

// A chart with nothing to show is not drawn.
export function hasData(chart: ChartSpec): boolean {
  if (chart.kind === "bars") return chart.rows.some((row) => row.value > 0);
  if (chart.kind === "columns") return chart.points.some((point) => point.value > 0);
  return chart.points.some((point) => point.a > 0 || point.b > 0);
}
