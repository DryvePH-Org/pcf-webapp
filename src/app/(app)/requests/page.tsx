import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { formatPHP } from "@/lib/money";
import { REQUEST_STATUSES, requestStatusLabel } from "@/lib/request-status";

const PAGE_SIZE = 20;
export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; mine?: string }> }) {
  const user = await requireUser("/requests");
  const params = await searchParams;
  const status = REQUEST_STATUSES.find(value => value === params.status);
  const mine = params.mine === "1" || user.role === "requester" || user.role === "approver";
  const parsedPage = Number(params.page);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 100000) : 1;
  const supabase = await createClient();
  let query = supabase.from("budget_requests").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id");
  if (status) query = query.eq("status", status);
  if (mine) query = query.eq("requester_id", user.id);
  const { data, error, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  function href(next: number) {
    const q = new URLSearchParams({ page: String(next) });
    if (status) q.set("status", status);
    if (mine) q.set("mine", "1");
    return `/requests?${q}`;
  }
  return <div className="space-y-6">
    <PageHeader title="Budget requests" description="Track your requests and review requests for your assigned funds." actions={<>
      <CsvExportButton filename={`budget-requests-page-${page}.csv`} label="Export this page" header={["Request", "Name", "Fund", "Budget", "Purpose", "Status", "Submitted", "Review note"]} rows={data.map(r => [r.request_no, r.requester_name, r.fund_name, r.amount, r.purpose, requestStatusLabel(r.status), r.created_at, r.review_note ?? ""])} />
      <Button nativeButton={false} render={<Link href="/requests/new" />}>Request a budget</Button>
    </>} />
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border p-3">
      <div className="space-y-1"><label htmlFor="request-status" className="text-sm">Status</label><select id="request-status" name="status" defaultValue={status ?? ""} className="block h-11 max-w-full rounded-md border bg-background px-2 text-sm"><option value="">All statuses</option>{REQUEST_STATUSES.map(s => <option key={s} value={s}>{requestStatusLabel(s)}</option>)}</select></div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={mine} />My requests only</label>
      <Button type="submit" variant="outline" className="h-11">Filter</Button>
    </form>
    <p className="text-sm text-muted-foreground">{count ?? 0} requests · Page {page}. CSV exports the displayed page.</p>
    <div className="space-y-3">{data.map(r => <Link key={r.id} href={`/requests/${r.id}`} className="block space-y-2 rounded-xl border bg-card p-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-ring">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-all text-sm font-medium">{r.request_no}</span><Badge variant="outline">{requestStatusLabel(r.status)}</Badge></div>
      <div className="flex flex-wrap justify-between gap-2"><span>{r.requester_name} · {r.fund_name}</span><span className="font-semibold tabular-nums">{formatPHP(r.amount)}</span></div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{r.purpose}</p><p className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
    </Link>)}{data.length === 0 ? <p className="rounded-xl border p-6 text-muted-foreground">No budget requests match these filters.</p> : null}</div>
    <div className="flex justify-between gap-2">{page > 1 ? <Button variant="outline" nativeButton={false} render={<Link href={href(page - 1)} />}>Previous</Button> : <span />}{page * PAGE_SIZE < (count ?? 0) ? <Button variant="outline" nativeButton={false} render={<Link href={href(page + 1)} />}>Next</Button> : null}</div>
  </div>;
}
