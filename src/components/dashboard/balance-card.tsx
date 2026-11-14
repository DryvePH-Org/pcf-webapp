import { TriangleAlert, Wallet } from "lucide-react";

import { MoneyText } from "@/components/shared/money-text";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cashAfterSettlements } from "@/lib/fund-cash";
import { cn } from "@/lib/utils";

export type BalanceFund = {
  fund_id: string;
  name: string;
  fund_amount: number;
  released_vouchers_total: number;
  expected_cash: number;
  is_low: boolean;
  advances_pending_liquidation?: number;
  returns_due?: number;
  reimbursements_due?: number;
};

export function BalanceCard({ fund }: { fund: BalanceFund }) {
  const releasedPct =
    fund.fund_amount > 0
      ? Math.min(
          100,
          Math.max(0, (fund.released_vouchers_total / fund.fund_amount) * 100),
        )
      : 0;

  const cash = cashAfterSettlements(fund);

  return (
    <Card>
      <CardHeader>
        <CardAction>
          <Badge variant={fund.is_low ? "destructive" : "secondary"}>
            {fund.is_low ? "Low balance" : "Healthy"}
          </Badge>
        </CardAction>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          {fund.name}
        </CardTitle>
        <CardDescription>Imprest fund balance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Recorded cash on hand</p>
          <p className="font-heading text-3xl font-semibold tracking-tight">
            <MoneyText value={fund.expected_cash} />
          </p>
          <p className="text-xs text-muted-foreground">Counts a return or reimbursement only once the custodian has recorded it.</p>
        </div>

        <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium">Actual cash after pending settlements</p>
          <p className="font-heading text-2xl font-semibold tracking-tight">
            <MoneyText value={cash.afterSettlements} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {cash.pending ? (
              <>
                <MoneyText value={cash.recorded} />
                {cash.returnsDue > 0 ? <> + <MoneyText value={cash.returnsDue} /> cash returns due</> : null}
                {cash.reimbursementsDue > 0 ? <> − <MoneyText value={cash.reimbursementsDue} /> reimbursements due</> : null}
                . This is what you should be holding once those settlements are recorded; compare it with your count.
              </>
            ) : (
              "No settlements are pending, so this matches the recorded cash."
            )}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-sm">
            <span className="text-muted-foreground">Unreplenished cash out</span>
            <span>
              <MoneyText value={fund.released_vouchers_total} /> of{" "}
              <MoneyText value={fund.fund_amount} />
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`${fund.name}: ${Math.round(releasedPct)}% of the fund released`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(releasedPct)}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                fund.is_low ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${releasedPct}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs sm:text-sm">
          <div className="min-w-0">
            <p className="text-muted-foreground">Cash</p>
            <MoneyText
              value={fund.expected_cash}
              className="block truncate font-medium"
            />
          </div>
          <span className="text-muted-foreground">+</span>
          <div className="min-w-0">
            <p className="text-muted-foreground">Net cash out</p>
            <MoneyText
              value={fund.released_vouchers_total}
              className="block truncate font-medium"
            />
          </div>
          <span className="text-muted-foreground">=</span>
          <div className="min-w-0">
            <p className="text-muted-foreground">Fund</p>
            <MoneyText
              value={fund.fund_amount}
              className="block truncate font-medium"
            />
          </div>
        </div>

        <dl className="grid gap-2 text-xs sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Advances not yet liquidated</dt><dd><MoneyText value={fund.advances_pending_liquidation ?? 0} /></dd></div>
          <div><dt className="text-muted-foreground">Cash returns due</dt><dd><MoneyText value={fund.returns_due ?? 0} /></dd></div>
          <div><dt className="text-muted-foreground">Reimbursements due</dt><dd><MoneyText value={fund.reimbursements_due ?? 0} /></dd></div>
        </dl>

        {fund.is_low ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Cash on hand is running low. Prepare a replenishment soon.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
