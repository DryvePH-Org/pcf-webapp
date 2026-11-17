import Link from "next/link";
import { HandCoins } from "lucide-react";

import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { SettlementList } from "@/components/settlements/settlement-list";
import { loadSettlementsDue } from "@/lib/settlements-due";
import { settlementTotals } from "@/lib/settlements-core";

const SHOWN = 3;

// The first thing a custodian sees when cash is waiting to be settled.
export async function SettlementsBanner() {
  let items;
  try {
    items = (await loadSettlementsDue()).filter((item) => item.canAct);
  } catch {
    return null;
  }
  if (items.length === 0) return null;
  const totals = settlementTotals(items);

  return (
    <section aria-labelledby="settlements-banner-title" className="space-y-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <HandCoins className="mt-0.5 size-6 shrink-0" aria-hidden />
          <div>
            <h2 id="settlements-banner-title" className="font-heading text-lg font-semibold">
              {items.length === 1 ? "1 cash settlement to do" : `${items.length} cash settlements to do`}
            </h2>
            <p className="text-sm">
              {totals.toCollect > 0 ? <>Take back <MoneyText value={totals.toCollect} className="font-semibold" /></> : null}
              {totals.toCollect > 0 && totals.toPay > 0 ? " and " : null}
              {totals.toPay > 0 ? <>pay out <MoneyText value={totals.toPay} className="font-semibold" /></> : null}
              . The fund balance only changes once you record each one.
            </p>
          </div>
        </div>
        <Button nativeButton={false} render={<Link href="/settlements" />}>See all</Button>
      </div>
      <SettlementList items={items.slice(0, SHOWN)} />
      {items.length > SHOWN ? (
        <p className="text-sm">
          <Link href="/settlements" className="font-medium underline underline-offset-4">
            + {items.length - SHOWN} more
          </Link>
        </p>
      ) : null}
    </section>
  );
}
