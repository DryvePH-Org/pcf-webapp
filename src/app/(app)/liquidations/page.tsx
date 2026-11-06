import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LIQUIDATION_LABELS, LIQUIDATION_STATUSES, liquidationDifference } from "@/lib/liquidation";
import { formatPHP } from "@/lib/money";
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
  return <div className="space-y-6">
    <PageHeader title="Liquidations" description="Actual expenses, supporting receipts, custodian review, and cash settlement." actions={<CsvExportButton filename={`liquidations-page-${page}.csv`} label="Export this page" header={["PCV", "Name", "Department", "Filing date", "Received", "Spent", "Difference (positive = return)", "Status"]} rows={data.map(l => [l.pcv_number, l.employee_name, l.department, l.filing_date, l.amount_received, l.total_spent, liquidationDifference(String(l.amount_received), String(l.total_spent)).centavos / 100, LIQUIDATION_LABELS[l.status]])} />} />
    <p className="text-sm text-muted-foreground">To file liquidation, open the released voucher in your Budget Request and choose File liquidation. Direct-voucher preparers can file from the voucher page.</p>
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border p-3">
      <div className="space-y-1"><label htmlFor="liquidation-status">Status</label><select id="liquidation-status" name="status" defaultValue={status ?? ""} className="block h-11 rounded-md border bg-background px-2 text-sm"><option value="">All statuses</option>{LIQUIDATION_STATUSES.map(s => <option key={s} value={s}>{LIQUIDATION_LABELS[s]}</option>)}</select></div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={mine} />My liquidations only</label><Button className="h-11" type="submit" variant="outline">Filter</Button>
    </form>
    <p className="text-sm text-muted-foreground">{count ?? 0} liquidations · Page {page}</p>
    <div className="space-y-3">{data.map(l => <Link href={`/liquidations/${l.id}`} key={l.id} className="block space-y-2 rounded-xl border bg-card p-4 hover:border-primary">
      <div className="flex flex-wrap justify-between gap-2"><strong>{l.pcv_number}</strong><Badge variant="outline">{LIQUIDATION_LABELS[l.status]}</Badge></div><p>{l.employee_name} · {l.fund_name}</p><p className="text-sm text-muted-foreground">Spent {formatPHP(l.total_spent)} of {formatPHP(l.amount_received)} received · {formatDate(l.filing_date)}</p>
    </Link>)}{data.length === 0 ? <p className="rounded-xl border p-6 text-muted-foreground">No liquidations match these filters.</p> : null}</div>
    <div className="flex justify-between gap-2">{page > 1 ? <Link className="underline" href={pageLink(page - 1)}>Previous</Link> : <span />}{page * 20 < (count ?? 0) ? <Link className="underline" href={pageLink(page + 1)}>Next</Link> : null}</div>
  </div>;
}
