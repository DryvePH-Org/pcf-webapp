import Link from "next/link";
import { ArrowRight, CircleCheck, Plus } from "lucide-react";

import { LiquidationStatusPill, RequestStatusPill } from "@/components/shared/flow-status-pills";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { canPerform, type Role } from "@/lib/permissions";
import { shortRef } from "@/lib/refs";

type Item = { key: string; href: string; pill: React.ReactNode; title: string; detail: string; amount?: number | string };

// Everything that is waiting on this person, in one place, whatever their role.
export async function MyWork({ userId, role }: { userId: string; role: Role }) {
  const db = await createClient();
  const reviewer = canPerform(role, "request.review");

  const [liquidations, requests, toReviewRequests, toReviewLiquidations] = await Promise.all([
    db.from("liquidations").select("id, pcv_number, status, total_spent, amount_received").eq("owner_id", userId).in("status", ["flagged", "draft", "submitted"]).order("updated_at", { ascending: false }).limit(5),
    db.from("budget_requests").select("id, request_no, status, amount, purpose").eq("requester_id", userId).in("status", ["submitted", "approved"]).order("created_at", { ascending: false }).limit(5),
    reviewer ? db.from("budget_requests").select("id", { count: "exact", head: true }).eq("status", "submitted").neq("requester_id", userId) : null,
    reviewer ? db.from("liquidations").select("id", { count: "exact", head: true }).eq("status", "submitted").neq("owner_id", userId) : null,
  ]);

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
  const reviewLiquidations = toReviewLiquidations?.count ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs your attention</CardTitle>
        <CardDescription>Your budget requests and liquidations, and anything waiting for your review.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {reviewRequests + reviewLiquidations > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {reviewRequests > 0 ? (
              <Link href="/requests?status=submitted" className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
                <span className="font-semibold">{reviewRequests} budget {reviewRequests === 1 ? "request" : "requests"} to review</span>
                <ArrowRight className="size-4 shrink-0" aria-hidden />
              </Link>
            ) : null}
            {reviewLiquidations > 0 ? (
              <Link href="/liquidations?status=submitted" className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
                <span className="font-semibold">{reviewLiquidations} {reviewLiquidations === 1 ? "liquidation" : "liquidations"} to review</span>
                <ArrowRight className="size-4 shrink-0" aria-hidden />
              </Link>
            ) : null}
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
        ) : reviewRequests + reviewLiquidations === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CircleCheck className="size-4 text-emerald-600" aria-hidden />You are all caught up. Nothing is waiting on you.</p>
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
