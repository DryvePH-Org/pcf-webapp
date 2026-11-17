import { CircleCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { MoneyText } from "@/components/shared/money-text";
import { Callout } from "@/components/shared/callout";
import { SettlementList } from "@/components/settlements/settlement-list";
import { requireUser } from "@/lib/auth";
import { settlementTotals } from "@/lib/settlements-core";
import { loadSettlementsDue } from "@/lib/settlements-due";

export default async function SettlementsPage() {
  await requireUser("/settlements");
  const items = await loadSettlementsDue();
  const mine = items.filter((item) => item.canAct);
  const others = items.filter((item) => !item.canAct);
  const totals = settlementTotals(items);

  return (
    <div className="space-y-6">
      <PageHeader title="Cash settlements" description="Cash that still has to change hands before the fund balance is right." />

      <Callout tone="neutral" title="How it works">
        When a liquidation is approved, any difference between the advance and the actual spending is settled in cash. Take back the change, or pay the reimbursement, then press Record on the item. The fund balance only changes when you record it.
      </Callout>

      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-emerald-600" aria-hidden />
          Nothing to settle. Every approved liquidation is settled.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {totals.toCollect > 0 ? <>To take back: <MoneyText value={totals.toCollect} className="font-semibold text-foreground" />. </> : null}
            {totals.toPay > 0 ? <>To pay out: <MoneyText value={totals.toPay} className="font-semibold text-foreground" />.</> : null}
          </p>
          {mine.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-heading text-base font-medium">To do now ({mine.length})</h2>
              <SettlementList items={mine} />
            </section>
          ) : null}
          {others.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-heading text-base font-medium">Waiting for someone else ({others.length})</h2>
              <SettlementList items={others} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
