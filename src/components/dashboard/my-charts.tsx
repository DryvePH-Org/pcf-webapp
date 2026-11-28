import { BarChart3 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { loadMyCharts } from "@/lib/my-charts-data";
import { hasData, type BarsSpec, type ChartSpec, type ColumnsSpec, type Kpi, type PairedSpec, type Unit } from "@/lib/my-charts";
import { formatPHP } from "@/lib/money";

const compactPHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 });

// Full text for tooltips, tiles and the screen-reader table; short text for labels drawn on a chart.
function full(value: number, unit: Unit) {
  if (unit === "money") return formatPHP(value);
  if (unit === "hours") return `${value} h`;
  if (unit === "percent") return `${value}%`;
  if (unit === "days") return `${value} ${value === 1 ? "day" : "days"}`;
  return String(value);
}
function short(value: number, unit: Unit) {
  if (unit === "money") return compactPHP.format(value);
  if (unit === "hours") return `${value}h`;
  return String(value);
}

function KpiTile({ kpi }: { kpi: Kpi }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{kpi.value === null ? "—" : full(kpi.value, kpi.unit)}</p>
      {kpi.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{kpi.hint}</p> : null}
    </div>
  );
}

const W = 320;
const H = 190;
const BASE = 160;
const TOP = 26;

// A bar with a rounded top that sits on the baseline.
function barPath(x: number, width: number, height: number) {
  const r = Math.min(4, width / 2, height);
  const y = BASE - height;
  return `M${x},${BASE} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${BASE} Z`;
}

function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{head.map((cell) => <th key={cell}>{cell}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function Columns({ chart }: { chart: ColumnsSpec }) {
  const max = Math.max(...chart.points.map((point) => point.value), 1);
  const slot = W / chart.points.length;
  const width = Math.min(34, slot * 0.55);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${chart.title}, ${chart.description}`} className="w-full">
        <line x1="0" x2={W} y1={BASE} y2={BASE} className="stroke-border" />
        {chart.points.map((point, index) => {
          const height = (point.value / max) * (BASE - TOP);
          const x = index * slot + (slot - width) / 2;
          return (
            <g key={point.full}>
              <title>{`${point.full}: ${full(point.value, chart.unit)}`}</title>
              {point.value > 0 ? <path d={barPath(x, width, height)} style={{ fill: "var(--viz-1)" }} /> : null}
              {point.value > 0 ? (
                <text x={index * slot + slot / 2} y={BASE - height - 6} textAnchor="middle" fontSize="11" className="fill-foreground tabular-nums">
                  {short(point.value, chart.unit)}
                </text>
              ) : null}
              <text x={index * slot + slot / 2} y={BASE + 16} textAnchor="middle" fontSize="11" className="fill-muted-foreground">
                {point.label}
              </text>
              <rect x={index * slot} y="0" width={slot} height={H} fill="transparent" />
            </g>
          );
        })}
      </svg>
      <DataTable caption={chart.title} head={["Month", chart.title]} rows={chart.points.map((point) => [point.full, full(point.value, chart.unit)])} />
    </>
  );
}

function Paired({ chart }: { chart: PairedSpec }) {
  const max = Math.max(...chart.points.flatMap((point) => [point.a, point.b]), 1);
  const slot = W / chart.points.length;
  const width = Math.min(16, slot * 0.3);
  const gap = 2;
  return (
    <>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {[
          [chart.a, "var(--viz-1)"],
          [chart.b, "var(--viz-2)"],
        ].map(([name, color]) => (
          <li key={name} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
            {name}
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${chart.title}, ${chart.description}`} className="w-full">
        <line x1="0" x2={W} y1={BASE} y2={BASE} className="stroke-border" />
        {chart.points.map((point, index) => {
          const left = index * slot + slot / 2 - width - gap / 2;
          const heightA = (point.a / max) * (BASE - TOP);
          const heightB = (point.b / max) * (BASE - TOP);
          return (
            <g key={point.full}>
              <title>{`${point.full}: ${chart.a} ${full(point.a, chart.unit)}, ${chart.b} ${full(point.b, chart.unit)}`}</title>
              {point.a > 0 ? <path d={barPath(left, width, heightA)} style={{ fill: "var(--viz-1)" }} /> : null}
              {point.b > 0 ? <path d={barPath(left + width + gap, width, heightB)} style={{ fill: "var(--viz-2)" }} /> : null}
              <text x={index * slot + slot / 2} y={BASE + 16} textAnchor="middle" fontSize="11" className="fill-muted-foreground">
                {point.label}
              </text>
              <rect x={index * slot} y="0" width={slot} height={H} fill="transparent" />
            </g>
          );
        })}
      </svg>
      <DataTable
        caption={chart.title}
        head={["Month", chart.a, chart.b]}
        rows={chart.points.map((point) => [point.full, full(point.a, chart.unit), full(point.b, chart.unit)])}
      />
    </>
  );
}

function Bars({ chart }: { chart: BarsSpec }) {
  const max = Math.max(...chart.rows.map((row) => row.value), 1);
  return (
    <ul className="space-y-3">
      {chart.rows.map((row) => (
        <li key={row.label} className="space-y-1" title={`${row.label}: ${full(row.value, chart.unit)}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{full(row.value, chart.unit)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${(row.value / max) * 100}%`, background: "var(--viz-1)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChartCard({ chart }: { chart: ChartSpec }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{chart.title}</CardTitle>
        <CardDescription>{chart.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData(chart) ? (
          <p className="text-sm text-muted-foreground">{chart.kind === "bars" ? chart.empty : "Nothing to show for this period yet."}</p>
        ) : chart.kind === "columns" ? (
          <Columns chart={chart} />
        ) : chart.kind === "paired" ? (
          <Paired chart={chart} />
        ) : (
          <Bars chart={chart} />
        )}
      </CardContent>
    </Card>
  );
}

export function MyChartsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((item) => <Skeleton key={item} className="h-64 rounded-xl" />)}
      </div>
    </div>
  );
}

// Charts of the signed-in person's own activity. Loads after the rest of the dashboard and never blocks or breaks it.
export async function MyCharts() {
  const data = await loadMyCharts().catch(() => null);
  if (!data) return null;
  return (
    <section aria-labelledby="my-charts-title" className="space-y-4 [--viz-1:#2a78d6] [--viz-2:#eb6834] dark:[--viz-1:#3987e5] dark:[--viz-2:#d95926]">
      <div>
        <h2 id="my-charts-title" className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="size-5 text-muted-foreground" aria-hidden />
          {data.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{data.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.kpis.map((kpi) => <KpiTile key={kpi.label} kpi={kpi} />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.charts.map((chart) => <ChartCard key={chart.title} chart={chart} />)}
      </div>
    </section>
  );
}
