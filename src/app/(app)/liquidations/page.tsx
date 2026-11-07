import { OptionSelect } from "@/components/shared/option-select";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { MoneyText } from "@/components/shared/money-text";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Files } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import { Callout } from "@/components/shared/callout";
import { LiquidationStatusPill } from "@/components/shared/flow-status-pills";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LIQUIDATION_LABELS, LIQUIDATION_STATUSES, liquidationDifference } from "@/lib/liquidation";
import { formatDate } from "@/lib/dates";

export default async function LiquidationsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; mine?: string }> }) {
  const user = await requireUser("/liquidations");
  const params = await searchParams;
  const page = /^\d+$/.test(params.page ?? "") ? Math.max(1, Math.min(100000, Number(params.page))) : 1;
  const status = LIQUIDATION_STATUSES.find(s => s === params.status);
  const mine = params.mine === "1" || user.role === "requester";
  const db = await createClient();
  let query = db.from("liquidations").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id");
  if (mine) query = query.eq("owner_id", user.id);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query.range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error(error.message);
  const pageLink = (next: number) => `/liquidations?${new URLSearchParams({ page: String(next), ...(status ? { status } : {}), ...(mine ? { mine: "1" } : {}) })}`;
  const hasFilters = Boolean(status) || (mine && user.role !== "requester");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Liquidations"
        description="Report what was actually spent, attach receipts, and settle any cash left over or owed."
        actions={
          <CsvExportButton
            filename={`liquidations-page-${page}.csv`}
            label="Export this page"
            header={["PCV", "Name", "Department", "Filing date", "Received", "Spent", "Difference (positive = return)", "Status"]}
            rows={data.map(l => [l.pcv_number, l.employee_name, l.department, l.filing_date, l.amount_received, l.total_spent, liquidationDifference(String(l.amount_received), String(l.total_spent)).centavos / 100, LIQUIDATION_LABELS[l.status]])}
          />
        }
      />
      <Callout tone="info" title="How to file a liquidation">
        Open the released voucher from your budget request and choose File liquidation. Voucher preparers can also file from the voucher page.
      </Callout>
      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-4">
            <div className="w-full space-y-1.5 sm:w-64">
              <Label htmlFor="liquidation-status">Status</Label>
              <OptionSelect id="liquidation-status" name="status" defaultValue={status ?? ""} options={[{ value: "", label: "All statuses" }, ...LIQUIDATION_STATUSES.map(s => ({ value: s, label: LIQUIDATION_LABELS[s] }))]} />
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="size-4 accent-primary" />
              My liquidations only
            </label>
            <Button type="submit" variant="outline">Apply filter</Button>
            {hasFilters ? <Button variant="ghost" nativeButton={false} render={<Link href="/liquidations" />}>Clear</Button> : null}
          </form>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{count ?? 0}</span> {count === 1 ? "liquidation" : "liquidations"} · Page {page}
      </p>
      <ResponsiveList
        rows={data}
        getRowKey={l => l.id}
        columns={[
          { key: "pcv", header: "Voucher", className: "whitespace-nowrap", cell: l => <Link className="font-mono font-semibold underline underline-offset-4" href={`/liquidations/${l.id}`}>{l.pcv_number}</Link> },
          { key: "person", header: "Employee and fund", cell: l => <><span className="font-medium">{l.employee_name}</span><p className="text-sm text-muted-foreground">{l.fund_name}</p></> },
          { key: "received", header: "Received", headerClassName: "text-right", className: "text-right whitespace-nowrap", cell: l => <MoneyText value={l.amount_received} /> },
          { key: "spent", header: "Spent", headerClassName: "text-right", className: "text-right whitespace-nowrap", cell: l => <MoneyText value={l.total_spent} /> },
          { key: "result", header: "Result", headerClassName: "text-right", className: "text-right whitespace-nowrap", cell: l => <Result l={l} /> },
          { key: "status", header: "Status", cell: l => <LiquidationStatusPill status={l.status} /> },
          { key: "date", header: "Filed", className: "whitespace-nowrap text-muted-foreground", cell: l => formatDate(l.filing_date) },
        ]}
        renderCard={l => (
          <Link href={`/liquidations/${l.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <LiquidationStatusPill status={l.status} />
                  <span className="font-mono text-sm font-semibold">{l.pcv_number}</span>
                </div>
                <p className="font-medium">{l.employee_name} <span className="font-normal text-muted-foreground">· {l.fund_name}</span></p>
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Received</p><MoneyText value={l.amount_received} className="font-semibold" /></div>
                  <div><p className="text-xs text-muted-foreground">Spent</p><MoneyText value={l.total_spent} className="font-semibold" /></div>
                  <div><p className="text-xs text-muted-foreground">Result</p><Result l={l} /></div>
                </div>
                <p className="text-xs text-muted-foreground">Filed {formatDate(l.filing_date)}</p>
              </CardContent>
            </Card>
          </Link>
        )}
        empty={<EmptyState icon={Files} title="No matching liquidations" description="Change the filters, or file a liquidation from a released voucher." />}
      />
      <div className="flex justify-between gap-2">
        {page > 1 ? <Button variant="outline" nativeButton={false} render={<Link href={pageLink(page - 1)} />}>Previous</Button> : <span />}
        {page * 20 < (count ?? 0) ? <Button variant="outline" nativeButton={false} render={<Link href={pageLink(page + 1)} />}>Next</Button> : null}
      </div>
    </div>
  );
}

// Return (employee owes cash back) and reimbursement (fund owes the employee)
// are opposite directions, so they get opposite colours and plain words.
function Result({ l }: { l: { amount_received: number; total_spent: number } }) {
  const diff = liquidationDifference(String(l.amount_received), String(l.total_spent));
  if (diff.kind === "none") return <span className="text-sm font-semibold text-emerald-700">Balanced</span>;
  return (
    <span className={diff.kind === "return" ? "text-sm font-semibold text-amber-700" : "text-sm font-semibold text-sky-700"}>
      {diff.kind === "return" ? "Return " : "Owed "}
      <MoneyText value={diff.amount} />
    </span>
  );
}
