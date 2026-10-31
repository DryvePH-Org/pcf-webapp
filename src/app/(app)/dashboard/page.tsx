import Link from "next/link";
import { ClipboardCheck, LayoutDashboard } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { canPerform, ROLE_LABELS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

type FlaggedVoucher = {
  id: string;
  pcv_number: string;
  payee: string;
  amount: number;
  reject_reason: string | null;
  voucher_date: string;
};

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const firstName = user.full_name.split(" ")[0] || user.full_name;
  const canApprove = canPerform(user.role, "voucher.approve");
  const seesFlagged = user.role === "custodian" || user.role === "admin";

  const supabase = await createClient();

  let pendingCount = 0;
  if (canApprove) {
    const { count, error } = await supabase
      .from("vouchers")
      .select("id", { count: "exact", head: true })
      .eq("status", "released")
      .neq("prepared_by", user.id);
    if (error) throw new Error(error.message);
    pendingCount = count ?? 0;
  }

  let flagged: FlaggedVoucher[] = [];
  if (seesFlagged) {
    const { data, error } = await supabase
      .from("vouchers")
      .select("id, pcv_number, payee, amount, reject_reason, voucher_date")
      .eq("status", "rejected")
      .order("voucher_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    flagged = data ?? [];
  }

  const hasCards = canApprove || seesFlagged;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Your petty cash overview and next actions."
        actions={<Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>}
      />

      {hasCards ? (
        <div className="grid gap-6 md:grid-cols-2">
          {canApprove ? (
            <Card>
              <CardHeader>
                <CardAction>
                  <Badge>{pendingCount}</Badge>
                </CardAction>
                <CardTitle>Pending approvals</CardTitle>
                <CardDescription>
                  Released vouchers waiting for your review, oldest first.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-heading text-3xl font-semibold tabular-nums">
                  {pendingCount}
                </p>
                <p className="text-sm text-muted-foreground">
                  Vouchers you prepared are excluded.
                </p>
              </CardContent>
              <CardFooter>
                <Button nativeButton={false} render={<Link href="/approvals" />}>
                  Open queue
                </Button>
              </CardFooter>
            </Card>
          ) : null}

          {seesFlagged ? (
            <Card>
              <CardHeader>
                <CardAction>
                  <Badge variant="destructive">{flagged.length}</Badge>
                </CardAction>
                <CardTitle>Flagged vouchers</CardTitle>
                <CardDescription>
                  Cash stays counted until an admin voids or corrects these.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {flagged.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No flagged vouchers.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {flagged.map((voucher) => (
                      <li
                        key={voucher.id}
                        className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={`/vouchers/${voucher.id}`}
                            className="font-medium hover:underline"
                          >
                            {voucher.pcv_number}
                          </Link>
                          <MoneyText
                            value={voucher.amount}
                            className="text-sm font-medium"
                          />
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {voucher.payee} · {formatDate(voucher.voucher_date)}
                        </p>
                        {voucher.reject_reason ? (
                          <p className="text-sm text-destructive">
                            {voucher.reject_reason}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={LayoutDashboard}
          title="Overview coming together"
          description="Your replenishments and monthly spend will appear here."
        />
      )}

      {canApprove && pendingCount > 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardCheck className="size-4" />
          {pendingCount === 1
            ? "1 voucher is waiting for review."
            : `${pendingCount} vouchers are waiting for review.`}{" "}
          <Link href="/approvals" className="font-medium text-foreground hover:underline">
            Review now
          </Link>
        </p>
      ) : null}
    </div>
  );
}
