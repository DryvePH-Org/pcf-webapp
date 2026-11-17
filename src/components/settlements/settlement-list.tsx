import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";

import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { settlementAction, type SettlementItem } from "@/lib/settlements-core";
import { cn } from "@/lib/utils";

const DAY = 24 * 60 * 60 * 1000;

function waiting(since: string | null) {
  if (!since) return null;
  const days = Math.floor((Date.now() - new Date(since).getTime()) / DAY);
  if (days < 1) return "since today";
  return days === 1 ? "waiting 1 day" : `waiting ${days} days`;
}

export function SettlementList({ items }: { items: SettlementItem[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key} className={cn("rounded-lg border bg-card p-3 text-card-foreground", item.canAct ? "border-amber-300 dark:border-amber-800" : "opacity-80")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">{settlementAction(item)}</p>
              <p className="text-sm text-muted-foreground">
                {item.ref} · {item.fund}
                {item.since ? ` · ${formatDate(item.since)}` : ""}
              </p>
              {waiting(item.since) ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" aria-hidden />
                  {waiting(item.since)}
                </p>
              ) : null}
              {item.canAct ? null : <p className="text-xs text-muted-foreground">Another custodian, the assigned approver or an administrator has to record this one.</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              <MoneyText value={item.amount} className="font-heading text-xl font-semibold" />
              <Button size="sm" variant={item.canAct ? "default" : "outline"} nativeButton={false} render={<Link href={item.href} />}>
                {item.canAct ? "Record it" : "Open"}
                <ArrowRight />
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
