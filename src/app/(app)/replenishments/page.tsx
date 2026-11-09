import { ReplenishmentEligibilityPanel } from "@/components/replenishments/eligibility-panel";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { NewReplenishmentButton } from "@/components/replenishments/new-replenishment-button";
import type {
  ReplenishmentFundOption,
  ReplenishmentListRow,
} from "@/components/replenishments/types";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { ReplenishmentStatusBadge } from "@/components/shared/replenishment-status-badge";
import {
  ResponsiveList,
  type ResponsiveListColumn,
} from "@/components/shared/responsive-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { canPerform } from "@/lib/permissions";
import { isReplenishmentStatus } from "@/lib/replenishment-status";
import { createClient } from "@/lib/supabase/server";


export default async function ReplenishmentsPage({ searchParams }: { searchParams: Promise<{ page?: string; queue?: string }> }) {
  const params = await searchParams;
  const page = /^\d+$/.test(params.page ?? "") ? Math.max(1, Math.min(100000, Number(params.page))) : 1;
  const queue = /^\d+$/.test(params.queue ?? "") ? Math.max(1, Math.min(100000, Number(params.queue))) : 1;
  const user = await requireUser("/replenishments");
  const supabase = await createClient();

  const [replenishmentsResult, fundsResult, eligibleResult] =
    await Promise.all([
      supabase
        .from("replenishments")
        .select(
          "id, request_no, fund_id, status, total, requested_by, created_at", { count: "exact" },
        )
        .order("created_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1),
      supabase.from("funds").select("id, name, is_active"),
      user.role === "approver" ? Promise.resolve({data:[],error:null}) : supabase.rpc("replenishment_fund_options"),
    ]);

  if (replenishmentsResult.error) throw new Error(replenishmentsResult.error.message);
  if (fundsResult.error) throw new Error(fundsResult.error.message);
  if (eligibleResult.error) throw new Error(eligibleResult.error.message);

  const replenishments = replenishmentsResult.data;
  const funds = fundsResult.data;
  const fundNames = new Map(funds.map((fund) => [fund.id, fund.name]));
  const requestedByIds = [
    ...new Set(
      replenishments
        .map((replenishment) => replenishment.requested_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const requestedByNames = new Map<string, string>();
  if (requestedByIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", requestedByIds);
    if (profileError) throw new Error(profileError.message);
    for (const profile of profiles) {
      requestedByNames.set(profile.id, profile.full_name);
    }
  }

  const voucherCounts = new Map<string, number>();
  await Promise.all(replenishments.map(async r => {
    const { count, error } = await supabase.from("replenishment_items").select("id", { count: "exact", head: true }).eq("replenishment_id", r.id);
    if (error) throw new Error(error.message);
    voucherCounts.set(r.id, count ?? 0);
  }));

  const rows: ReplenishmentListRow[] = replenishments.map(
    (replenishment) => ({
      id: replenishment.id,
      request_no: replenishment.request_no,
      fund_name: fundNames.get(replenishment.fund_id) ?? "—",
      status: isReplenishmentStatus(replenishment.status)
        ? replenishment.status
        : "draft",
      total: String(replenishment.total),
      voucher_count: voucherCounts.get(replenishment.id) ?? 0,
      requested_by_name: replenishment.requested_by
        ? (requestedByNames.get(replenishment.requested_by) ?? "—")
        : "—",
      created_at: replenishment.created_at,
    }),
  );

  const fundOptions: ReplenishmentFundOption[] = eligibleResult.data.map(f => ({ ...f, total: String(f.total) }));

  const columns: ResponsiveListColumn<ReplenishmentListRow>[] = [
    {
      key: "request",
      header: "Request",
      cell: (replenishment) => (
        <Link
          href={`/replenishments/${replenishment.id}`}
          className="font-medium hover:underline"
        >
          {replenishment.request_no}
        </Link>
      ),
    },
    {
      key: "fund",
      header: "Fund",
      cell: (replenishment) => replenishment.fund_name,
    },
    {
      key: "created",
      header: "Created",
      cell: (replenishment) => formatDate(replenishment.created_at),
    },
    {
      key: "vouchers",
      header: "Vouchers",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      cell: (replenishment) => replenishment.voucher_count,
    },
    {
      key: "total",
      header: "Total",
      headerClassName: "text-right",
      className: "text-right",
      cell: (replenishment) => <MoneyText value={replenishment.total} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (replenishment) => (
        <ReplenishmentStatusBadge status={replenishment.status} />
      ),
    },
    {
      key: "requested_by",
      header: "Requested by",
      cell: (replenishment) => replenishment.requested_by_name,
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-0",
      className: "text-right",
      cell: (replenishment) => (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/replenishments/${replenishment.id}`} />}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Replenishments"
        description="Replenish approved, settled expenses. Accounting confirms when cash has actually been received."
        actions={
          <><CsvExportButton filename={`replenishments-page-${page}.csv`} label="Export this page" header={["Request", "Fund", "Total expenses", "Status", "Vouchers"]} rows={rows.map(r => [r.request_no, r.fund_name, r.total, r.status, r.voucher_count])} />{canPerform(user.role, "replenishment.create") ? <NewReplenishmentButton funds={fundOptions} /> : null}</>
        }
      />

      <ReplenishmentEligibilityPanel page={queue} />
      <p className="text-sm text-muted-foreground">{replenishmentsResult.count ?? 0} replenishments · Page {page}</p>
      <div className="flex justify-between text-sm">{page > 1 ? <Link className="underline" href={`?page=${page - 1}`}>Previous requests</Link> : <span />}{page * 20 < (replenishmentsResult.count ?? 0) ? <Link className="underline" href={`?page=${page + 1}`}>More requests</Link> : null}</div>
      <ResponsiveList
        rows={rows}
        columns={columns}
        getRowKey={(replenishment) => replenishment.id}
        renderCard={(replenishment) => (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/replenishments/${replenishment.id}`}
                    className="font-medium hover:underline"
                  >
                    {replenishment.request_no}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    {replenishment.fund_name}
                  </p>
                </div>
                <ReplenishmentStatusBadge status={replenishment.status} />
              </div>
              <div className="flex items-end justify-between gap-3 text-sm">
                <div className="text-muted-foreground">
                  <p>{formatDate(replenishment.created_at)}</p>
                  <p>
                    {replenishment.voucher_count}{" "}
                    {replenishment.voucher_count === 1 ? "voucher" : "vouchers"}
                  </p>
                </div>
                <MoneyText
                  value={replenishment.total}
                  className="text-base font-medium"
                />
              </div>
            </CardContent>
          </Card>
        )}
        empty={
          <EmptyState
            icon={RefreshCw}
            title="No replenishments yet"
            description="Create a request once released vouchers are waiting to be reimbursed."
          />
        }
      />
    </div>
  );
}
