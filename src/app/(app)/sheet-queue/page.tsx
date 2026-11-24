import { ListOrdered } from "lucide-react";

import { AutoRefresh } from "@/components/sheet-queue/auto-refresh";
import { RetryButton } from "@/components/sheet-queue/retry-button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { ResponsiveList, type ResponsiveListColumn } from "@/components/shared/responsive-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { loadSheetQueue, type QueueRow } from "@/lib/grokbot/queue-data";
import type { QueueStateKey, ReportKey } from "@/lib/grokbot/queue-view";

export const dynamic = "force-dynamic";

const BADGE: Record<QueueStateKey, "default" | "secondary" | "destructive" | "outline"> = {
  waiting: "outline",
  retry_wait: "outline",
  sending: "secondary",
  written: "default",
  attention: "destructive",
};

const REPORT_BADGE: Record<ReportKey, "default" | "secondary" | "destructive" | "outline"> = {
  not_reported: "outline",
  reading: "secondary",
  synced: "default",
  read_failed: "destructive",
};

function StateCell({ row }: { row: QueueRow }) {
  return (
    <div className="max-w-sm space-y-1">
      <Badge variant={BADGE[row.state]}>{row.label}</Badge>
      <p className="text-xs text-muted-foreground whitespace-normal">
        {row.state === "waiting" && row.position ? `Number ${row.position} in line. ` : ""}
        {row.state === "retry_wait" && row.notBefore ? `Next try ${formatDateTime(row.notBefore)}. ` : ""}
        {row.detail}
      </p>
      {row.report ? (
        <div className="space-y-1 pt-1">
          <Badge variant={REPORT_BADGE[row.report.key]}>{row.report.label}</Badge>
          <p className="text-xs text-muted-foreground whitespace-normal">{row.report.detail}</p>
        </div>
      ) : null}
    </div>
  );
}

export default async function SheetQueuePage() {
  const user = await requireUser("/sheet-queue");
  const { rows, health } = await loadSheetQueue(user);
  const active = rows.some((row) => row.state === "waiting" || row.state === "retry_wait" || row.state === "sending");

  const columns: ResponsiveListColumn<QueueRow>[] = [
    {
      key: "item",
      header: "Entry",
      cell: (row) => (
        <div className="space-y-1">
          <p className="font-medium">{row.title}</p>
          {row.who ? <p className="text-xs text-muted-foreground">{row.who}</p> : null}
        </div>
      ),
    },
    {
      key: "sheet",
      header: "Fund / workbook",
      cell: (row) => (
        <div className="space-y-1">
          <p>{row.fund}</p>
          <p className="text-xs text-muted-foreground">{row.workbook}</p>
        </div>
      ),
    },
    { key: "amount", header: "Amount", headerClassName: "text-right", className: "text-right", cell: (row) => <MoneyText value={row.amount} /> },
    { key: "state", header: "Status", cell: (row) => <StateCell row={row} /> },
    { key: "updated", header: "Updated", cell: (row) => <span className="text-sm whitespace-nowrap">{formatDateTime(row.updatedAt)}</span> },
    { key: "action", header: "", headerClassName: "text-right", className: "text-right", cell: (row) => (row.canRetry ? <RetryButton id={row.id} /> : null) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sheet queue"
        description="Approved liquidations and replenishments on their way to the Google Sheet. The bots take one at a time, oldest first, so a busy day never overloads them."
      />
      <AutoRefresh active={active} />

      {health.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {health.map((item) => (
            <Card key={item.workbook}>
              <CardContent className="space-y-1">
                <p className="font-medium">{item.workbook}</p>
                <p className="text-sm text-muted-foreground">
                  {item.waiting} waiting · {item.sending} sending ·{" "}
                  <span className={item.attention ? "font-medium text-destructive" : ""}>{item.attention} need attention</span>
                </p>
                <p className="text-xs text-muted-foreground">{item.lastWritten ? `Last written ${formatDateTime(item.lastWritten)}` : "Nothing written yet"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <ResponsiveList
        rows={rows}
        columns={columns}
        getRowKey={(row) => row.id}
        empty={<EmptyState icon={ListOrdered} title="Nothing in the queue" description="Approved liquidations will show here while they are written to the sheet." />}
        renderCard={(row) => (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">{row.who ? `${row.who} · ` : ""}{row.fund}</p>
                </div>
                <MoneyText value={row.amount} />
              </div>
              <StateCell row={row} />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{formatDateTime(row.updatedAt)}</span>
                {row.canRetry ? <RetryButton id={row.id} /> : null}
              </div>
            </CardContent>
          </Card>
        )}
      />
    </div>
  );
}
