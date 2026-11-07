import { OptionSelect } from "@/components/shared/option-select";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { MoneyText } from "@/components/shared/money-text";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Files, Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import { Button } from "@/components/ui/button";
import { RequestStatusPill } from "@/components/shared/flow-status-pills";
import { shortRef } from "@/lib/refs";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
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
  const hasFilters = Boolean(status) || (mine && user.role !== "requester" && user.role !== "approver");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget requests"
        description="Ask for a budget, track where your request stands, and review requests for your funds."
        actions={
          <>
            <CsvExportButton
              filename={`budget-requests-page-${page}.csv`}
              label="Export this page"
              header={["Request", "Name", "Fund", "Budget", "Purpose", "Status", "Submitted", "Review note"]}
              rows={data.map(r => [r.request_no, r.requester_name, r.fund_name, r.amount, r.purpose, requestStatusLabel(r.status), r.created_at, r.review_note ?? ""])}
            />
            <Button nativeButton={false} render={<Link href="/requests/new" />}>
              <Plus />
              Request a budget
            </Button>
          </>
        }
      />
      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-4">
            <div className="w-full space-y-1.5 sm:w-64">
              <Label htmlFor="request-status">Status</Label>
              <OptionSelect id="request-status" name="status" defaultValue={status ?? ""} options={[{ value: "", label: "All statuses" }, ...REQUEST_STATUSES.map(s => ({ value: s, label: requestStatusLabel(s) }))]} />
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="size-4 accent-primary" />
              My requests only
            </label>
            <Button type="submit" variant="outline">Apply filter</Button>
            {hasFilters ? <Button variant="ghost" nativeButton={false} render={<Link href="/requests" />}>Clear</Button> : null}
          </form>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{count ?? 0}</span> {count === 1 ? "request" : "requests"} · Page {page}
      </p>
      <ResponsiveList
        rows={data}
        getRowKey={r => r.id}
        columns={[
          { key: "request", header: "Request", className: "whitespace-nowrap", cell: r => <Link className="font-mono font-semibold underline underline-offset-4" href={`/requests/${r.id}`}>{shortRef(r.request_no)}</Link> },
          { key: "person", header: "Requester and purpose", className: "max-w-sm whitespace-normal", cell: r => <><span className="font-medium">{r.requester_name}</span><span className="text-muted-foreground"> · {r.fund_name}</span><p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{r.purpose}</p></> },
          { key: "amount", header: "Budget", headerClassName: "text-right", className: "text-right font-semibold whitespace-nowrap", cell: r => <MoneyText value={r.amount} /> },
          { key: "status", header: "Status", cell: r => <RequestStatusPill status={r.status} /> },
          { key: "date", header: "Submitted", className: "whitespace-nowrap text-muted-foreground", cell: r => formatDate(r.created_at) },
        ]}
        renderCard={r => (
          <Link href={`/requests/${r.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <RequestStatusPill status={r.status} />
                  <MoneyText value={r.amount} className="text-lg font-semibold whitespace-nowrap" />
                </div>
                <p className="line-clamp-2 font-medium">{r.purpose}</p>
                <p className="flex flex-wrap justify-between gap-x-3 text-sm text-muted-foreground">
                  <span>{r.requester_name} · {r.fund_name}</span>
                  <span className="font-mono">{shortRef(r.request_no)} · {formatDate(r.created_at)}</span>
                </p>
              </CardContent>
            </Card>
          </Link>
        )}
        empty={<EmptyState icon={Files} title="No matching budget requests" description="Change the filters, or request a budget to get started." />}
      />
      <div className="flex justify-between gap-2">
        {page > 1 ? <Button variant="outline" nativeButton={false} render={<Link href={href(page - 1)} />}>Previous</Button> : <span />}
        {page * PAGE_SIZE < (count ?? 0) ? <Button variant="outline" nativeButton={false} render={<Link href={href(page + 1)} />}>Next</Button> : null}
      </div>
    </div>
  );
}
