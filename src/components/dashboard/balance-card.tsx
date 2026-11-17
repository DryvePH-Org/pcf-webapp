import { CircleCheck, Info, TriangleAlert, Wallet } from "lucide-react";

import { MoneyTrailPanel } from "@/components/dashboard/money-trail-panel";
import { MoneyText } from "@/components/shared/money-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cashAfterSettlements } from "@/lib/fund-cash";
import type { MoneyTrail } from "@/lib/money-trail";
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

// One short line that says whether this fund needs a look.
function Verdict({ trail, pending }: { trail?: MoneyTrail; pending: boolean }) {
  const sheetOff = trail?.sheetUnexplained != null && trail.sheetUnexplained !== 0;
  if (sheetOff) {
    return (
      <p className="flex items-start gap-2 text-sm font-medium text-destructive">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        The Google Sheet is off by <MoneyText value={Math.abs(trail?.sheetUnexplained ?? 0)} />. Open the details.
      </p>
    );
  }
  if (pending || (trail && trail.difference !== 0)) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Some cash is still waiting to be settled. Open the details to see where it is.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400">
      <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
      Everything matches.
    </p>
  );
}

export function BalanceCard({ fund, trail }: { fund: BalanceFund; trail?: MoneyTrail }) {
  const releasedPct = fund.fund_amount > 0 ? Math.min(100, Math.max(0, (fund.released_vouchers_total / fund.fund_amount) * 100)) : 0;
  const cash = cashAfterSettlements(fund);

  return (
    <Card>
      <CardHeader>
        <CardAction>
          <Badge variant={fund.is_low ? "destructive" : "secondary"}>{fund.is_low ? "Low balance" : "Healthy"}</Badge>
        </CardAction>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          {fund.name}
        </CardTitle>
        <CardDescription>Cash you should be holding</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="font-heading text-3xl font-semibold tracking-tight">
          <MoneyText value={cash.afterSettlements} />
        </p>

        <div
          role="progressbar"
          aria-label={`${fund.name}: ${Math.round(releasedPct)}% of the fund is out`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(releasedPct)}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className={cn("h-full rounded-full transition-[width]", fund.is_low ? "bg-destructive" : "bg-primary")} style={{ width: `${releasedPct}%` }} />
        </div>

        <Verdict trail={trail} pending={cash.pending} />

        {fund.is_low ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            Running low. Prepare a replenishment soon.
          </p>
        ) : null}

        <Dialog>
          <DialogTrigger render={<Button variant="outline" className="w-full sm:w-auto" />}>See details</DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{fund.name}</DialogTitle>
              <DialogDescription>The full picture of this fund, in plain words.</DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 sm:col-span-2">
                  <dt className="font-medium">Cash you should be holding</dt>
                  <dd className="font-heading text-2xl font-semibold"><MoneyText value={cash.afterSettlements} /></dd>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cash.pending
                      ? "What is left once every pending return and reimbursement is recorded. Compare it with your count."
                      : "No settlements are pending, so this matches the cash recorded in the app."}
                  </p>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cash recorded in the app</dt>
                  <dd className="font-medium"><MoneyText value={fund.expected_cash} /></dd>
                  <p className="text-xs text-muted-foreground">Counts a return or reimbursement only after the custodian records it.</p>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cash out, not replenished</dt>
                  <dd className="font-medium"><MoneyText value={fund.released_vouchers_total} /> of <MoneyText value={fund.fund_amount} /></dd>
                  <p className="text-xs text-muted-foreground">Cash recorded + cash out = the fund amount.</p>
                </div>
                <div>
                  <dt className="text-muted-foreground">Advances not yet liquidated</dt>
                  <dd className="font-medium"><MoneyText value={fund.advances_pending_liquidation ?? 0} /></dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cash returns due</dt>
                  <dd className="font-medium"><MoneyText value={fund.returns_due ?? 0} /></dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reimbursements due</dt>
                  <dd className="font-medium"><MoneyText value={fund.reimbursements_due ?? 0} /></dd>
                </div>
              </dl>

              {trail ? <MoneyTrailPanel trail={trail} /> : null}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
