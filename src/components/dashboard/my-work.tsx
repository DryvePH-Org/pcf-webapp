import Link from "next/link";
import { ArrowRight, CircleCheck, Plus } from "lucide-react";

import { LiquidationStatusPill, RequestStatusPill } from "@/components/shared/flow-status-pills";
import { MoneyText } from "@/components/shared/money-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowDatabase } from "@/lib/workflow";
import { canPerform, type Role } from "@/lib/permissions";
import { shortRef } from "@/lib/refs";

type Item = { key: string; href: string; pill: React.ReactNode; title: string; detail: string; amount?: number | string };

// Everything that is waiting on this person, in one place, whatever their role.
export async function MyWork({ userId, role, approvalCount = 0, replenishmentCount = 0 }: { userId: string; role: Role; approvalCount?: number; replenishmentCount?: number }) {
  const db = await createClient();
  const reviewer = canPerform(role, "request.review");

  const [liquidations, requests, toReviewRequests, toReviewLiquidations] = await Promise.all([
    db.from("liquidations").select("id, pcv_number, status, total_spent, amount_received").eq("owner_id", userId).in("status", ["flagged", "draft", "submitted"]).order("updated_at", { ascending: false }).limit(5),
    db.from("budget_requests").select("id, request_no, status, amount, purpose").eq("requester_id", userId).in("status", ["submitted", "approved"]).order("created_at", { ascending: false }).limit(5),
    reviewer ? db.from("budget_requests").select("id", { count: "exact", head: true }).eq("status", "submitted").neq("requester_id", userId) : null,
    reviewer && role !== "approver" ? db.from("liquidations").select("id", { count: "exact", head: true }).eq("status", "submitted").neq("owner_id", userId) : null,
  ]);

  // An approver reviews the liquidations of the custodians of the funds they are assigned to.
  let approverLiquidations = 0;
  if (role === "approver") {
    const mine = await (db as unknown as SupabaseClient<WorkflowDatabase>).from("fund_approvers").select("fund_id").eq("approver_id", userId);
    const fundIds = (mine.data ?? []).map(row => row.fund_id);
    if (fundIds.length) {
      const [custodians, waiting] = await Promise.all([
        db.from("fund_custodians").select("fund_id, custodian_id").in("fund_id", fundIds),
        db.from("liquidations").select("fund_id, owner_id").eq("status", "submitted").in("fund_id", fundIds).neq("owner_id", userId).limit(500),
      ]);
      const pairs = new Set((custodians.data ?? []).map(row => `${row.fund_id}:${row.custodian_id}`));
      approverLiquidations = (waiting.data ?? []).filter(row => pairs.has(`${row.fund_id}:${row.owner_id}`)).length;
    }
  }

  const loadError = [liquidations, requests, toReviewRequests, toReviewLiquidations].some(result => result?.error);
  const items: Item[] = [];
  // Corrections first: those are blocked until the person acts.
  for (const l of [...(liquidations.data ?? [])].sort((a, b) => Number(b.status === "flagged") - Number(a.status === "flagged"))) {
    items.push({
      key: `l-${l.id}`,
      href: `/liquidations/${l.id}`,
      pill: <LiquidationStatusPill status={l.status} />,
      title: l.status === "flagged" ? `Fix liquidation ${l.pcv_number}` : l.status === "draft" ? `Finish liquidation ${l.pcv_number}` : `Liquidation ${l.pcv_number}`,
      detail: l.status === "submitted" ? "Waiting for the custodian" : `Spent so far ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(l.total_spent)}`,
    });
  }
  for (const r of requests.data ?? []) {
    items.push({
      key: `r-${r.id}`,
      href: `/requests/${r.id}`,
      pill: <RequestStatusPill status={r.status} />,
      title: r.purpose,
      detail: shortRef(r.request_no),
      amount: r.amount,
    });
  }

  const reviewRequests = toReviewRequests?.count ?? 0;
  const reviewLiquidations = role === "approver" ? approverLiquidations : (toReviewLiquidations?.count ?? 0);

  const reviewQueues = [
    { count: reviewRequests, href: "/requests?status=submitted", label: "budget requests to review" },
    { count: reviewLiquidations, href: "/liquidations?status=submitted", label: "liquidations to review" },
    { count: approvalCount, href: "/approvals", label: "vouchers to approve or review" },
    { count: replenishmentCount, href: "/replenishments", label: "replenishments to review" },
  ].filter(queue => queue.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs your attention</CardTitle>
        <CardDescription>Your budget requests and liquidations, and anything waiting for your review.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? <Alert variant="destructive"><AlertDescription>Some attention items could not be loaded. Refresh the page to try again.</AlertDescription></Alert> : null}
        {reviewQueues.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {reviewQueues.map(queue => (
              <Link key={queue.href} href={queue.href} className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                <span className="font-semibold">{queue.count} {queue.label}</span>
                <ArrowRight className="size-4 shrink-0" aria-hidden />
              </Link>
            ))}
          </div>
        ) : null}

        {items.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {items.map(item => (
              <li key={item.key}>
                <Link href={item.href} className="flex flex-col gap-2 p-3 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <div className="sm:w-52 sm:shrink-0">{item.pill}</div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="truncate text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                  {item.amount !== undefined ? <MoneyText value={item.amount} className="font-semibold" /> : <ArrowRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden />}
                </Link>
              </li>
            ))}
          </ul>
        ) : !loadError && reviewQueues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CircleCheck className="size-4 text-emerald-600" aria-hidden />No budget requests, liquidations, or reviews in this summary.</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/requests/new" />}><Plus />Request a budget</Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/requests?mine=1" />}>My requests</Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/liquidations" />}>Liquidations</Button>
        </div>
      </CardContent>
    </Card>
  );
}
