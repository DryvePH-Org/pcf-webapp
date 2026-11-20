import { LiquidationDeadline } from "./deadline-indicator";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LiquidationStatusPill } from "@/components/shared/flow-status-pills";
import { Button } from "@/components/ui/button";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowDatabase } from "@/lib/workflow";
import { CreateLiquidationButton } from "./create-liquidation-button";

export async function VoucherLiquidationPanel({
  voucherId,
  userId,
  top = false,
}: {
  voucherId: string;
  userId: string;
  // A short version for the top of a phone screen: shown only when the
  // requester has something to do (file it, or fix a draft or flagged one).
  top?: boolean;
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
  // A custodian of the fund (or an administrator) can file for an employee who cannot use the website.
  const filing = !l && eligible && !mine ? await (db as unknown as SupabaseClient<WorkflowDatabase>).rpc("can_file_liquidation_for", { p_voucher: voucherId }) : null;
  if (filing?.error) throw new Error(filing.error.message);
  const canFileFor = filing?.data === true;

  if (top) {
    const needsAction =
      mine &&
      (l ? ["draft", "flagged"].includes(l.status) : eligible);
    if (!needsAction) return null;
    return (
      <section className="space-y-3 rounded-xl border-2 border-primary bg-primary/5 p-4 lg:hidden print:hidden">
        <h2 className="font-semibold">
          {l?.status === "flagged"
            ? "Your liquidation needs corrections"
            : l
              ? "Finish your liquidation"
              : "Your liquidation is due"}
        </h2>
        <LiquidationDeadline
          releasedAt={context.released_at}
          status={l?.status}
        />
        {l ? (
          <Button
            size="lg"
            className="w-full"
            nativeButton={false}
            render={<Link href={`/liquidations/${l.id}`} />}
          >
            Open liquidation
            <ArrowRight />
          </Button>
        ) : (
          <CreateLiquidationButton voucherId={voucherId} fullWidth />
        )}
      </section>
    );
  }

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
          {canFileFor ? (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
              <p className="text-sm">
                If {context.employee_name.split(/\s+/)[0]} cannot use the website, you can file the liquidation for them.
                It stays their liquidation; your name is recorded as the person who filed it, they are told, and someone
                else (another custodian, the approver or an administrator) reviews it.
              </p>
              <CreateLiquidationButton voucherId={voucherId} forName={context.employee_name} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
