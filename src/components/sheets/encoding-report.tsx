import { CircleAlert, CircleCheck, Clock, Loader2, type LucideIcon } from "lucide-react";

import { StatusPill, type Tone } from "@/components/shared/status-pill";
import { MoneyText } from "@/components/shared/money-text";
import { AutoRefresh } from "@/components/sheets/delivery-progress";
import { describeRows } from "@/lib/grokbot/report-summary";
import { formatDateTime } from "@/lib/dates";
import type { EncodingInfo, EncodingState } from "@/lib/sheets/encoding";

const STATES: Record<EncodingState, { tone: Tone; label: string; icon: LucideIcon; text: string }> = {
  waiting: { tone: "waiting", label: "Waiting for Grokbot", icon: Clock, text: "Queued. Grokbot handles one job at a time, so this starts when the one before it finishes." },
  encoding: { tone: "info", label: "Grokbot is writing", icon: Loader2, text: "Grokbot is writing to the sheet now. This page updates by itself." },
  encoded: { tone: "success", label: "Written to Google Sheets", icon: CircleCheck, text: "" },
  attention: { tone: "danger", label: "Needs attention", icon: CircleAlert, text: "Grokbot stopped before writing. Nothing was changed on the sheet for this entry." },
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium break-words">{children}</dd>
    </div>
  );
}

// What Grokbot did to the sheet, in plain words: where, how much, and what to check.
export function EncodingReport({
  title = "Google Sheets",
  info,
  workbook,
  worksheet,
  sheetUrl,
  entries,
  kind,
  children,
}: {
  title?: string;
  info: EncodingInfo;
  workbook?: string;
  worksheet?: string;
  sheetUrl?: string;
  entries?: { particulars: string; amount: number; category: string }[];
  kind: "liquidation" | "marker";
  children?: React.ReactNode;
}) {
  const meta = STATES[info.state];
  const { summary } = info;
  const rows = describeRows(summary.sheetRows);
  const link = sheetUrl && sheetUrl.startsWith("https://docs.google.com/spreadsheets/d/")
    ? `${sheetUrl}${summary.sheetRows[0] ? `&range=B${summary.sheetRows[0]}` : ""}`
    : null;

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6 print:hidden" aria-label={title}>
      <AutoRefresh active={info.state === "waiting" || info.state === "encoding"} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <StatusPill tone={meta.tone} icon={meta.icon}>{meta.label}</StatusPill>
      </div>

      {meta.text ? <p className="text-sm text-muted-foreground">{meta.text}</p> : null}
      {info.error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">{info.error}</p>
      ) : null}

      {info.state === "encoded" ? (
        <>
          <p className="text-sm">
            {kind === "marker"
              ? `Grokbot recorded the green marker${summary.replenishmentNumber ? ` PCF REPLENISHMENT #${String(summary.replenishmentNumber).padStart(2, "0")}` : ""} in the sheet.`
              : "Grokbot wrote this liquidation to the sheet and read it back to check."}
          </p>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workbook ? <Fact label="Workbook">{workbook}{worksheet ? ` · ${worksheet}` : ""}</Fact> : null}
            <Fact label="Where">{rows ?? "Not reported"}{summary.ranges.length ? ` (${summary.ranges.join(", ")})` : ""}</Fact>
            <Fact label="Rows written">{summary.rowsWritten ?? "Not reported"}</Fact>
            {summary.before && summary.after ? (
              <Fact label="Sheet balance">
                <MoneyText value={summary.before} /> → <MoneyText value={summary.after} />
              </Fact>
            ) : null}
            {summary.auditRows ? <Fact label="Audit trail rows">{summary.auditRows} on GROKBOT EDIT AUDIT</Fact> : null}
            {summary.completedAt || info.updatedAt ? <Fact label="Finished">{formatDateTime(summary.completedAt ?? info.updatedAt!)}</Fact> : null}
          </dl>
          {link ? (
            <a className="inline-block text-sm font-medium underline underline-offset-4" href={link} target="_blank" rel="noreferrer">
              Open the sheet at this entry
            </a>
          ) : null}
        </>
      ) : null}

      {entries && entries.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{info.state === "encoded" ? "What was encoded" : "What will be encoded"}</h3>
          <ul className="divide-y rounded-lg border text-sm">
            {entries.map((entry, index) => (
              <li key={index} className="flex items-start justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  {entry.particulars}
                  <span className="block text-xs text-muted-foreground">{entry.category}</span>
                </span>
                <MoneyText value={entry.amount} className="font-semibold whitespace-nowrap" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.warnings.length > 0 ? (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Notes from Grokbot</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      {children}
    </section>
  );
}
