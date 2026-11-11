import { LiquidationDeadline } from "./deadline-indicator";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LiquidationStatusPill } from "@/components/shared/flow-status-pills";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { CreateLiquidationButton } from "./create-liquidation-button";

export async function VoucherLiquidationPanel({
  voucherId,
  userId,
}: {
  voucherId: string;
  userId: string;
}) {
  const db = await createClient();
  const { data, error } = await db.rpc("liquidation_context", {
    p_voucher_id: voucherId,
  });
  if (error) throw new Error(error.message);
  const context = data[0];
  if (!context) return null;
  const { data: l, error: readError } = context.liquidation_id
    ? await db
        .from("liquidations")
        .select("id,status")
        .eq("id", context.liquidation_id)
        .single()
    : { data: null, error: null };
  if (readError) throw new Error(readError.message);
  const eligible =
    Boolean(context.released_at) &&
    !["void", "closed"].includes(context.voucher_status);
  const mine = context.owner_id === userId;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-6 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Liquidation</h2>
        {l ? <LiquidationStatusPill status={l.status} /> : null}
      </div>
      <LiquidationDeadline
        releasedAt={context.released_at}
        status={l?.status}
      />
      {l ? (
        <>
          <p className="text-sm text-muted-foreground">
            The actual expenses, their receipts, the custodian&apos;s review and
            any cash settlement live on the liquidation page.
          </p>
          <Button
            nativeButton={false}
            render={<Link href={`/liquidations/${l.id}`} />}
          >
            Open liquidation
            <ArrowRight />
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {eligible
              ? "Not filed yet. The advance has already reduced the cash on hand, so the actual expenses still need to be reported."
              : "You can file a liquidation once the cash has been released on an open voucher."}
          </p>
          {eligible && mine ? (
            <CreateLiquidationButton voucherId={voucherId} />
          ) : null}
        </>
      )}
    </section>
  );
}
