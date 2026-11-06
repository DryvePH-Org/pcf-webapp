import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LIQUIDATION_LABELS } from "@/lib/liquidation";
import { CreateLiquidationButton } from "./create-liquidation-button";
export async function VoucherLiquidationPanel({ voucherId, userId }: { voucherId: string; userId: string }) {
  const db = await createClient();
  const { data, error } = await db.rpc("liquidation_context", { p_voucher_id: voucherId });
  if (error) throw new Error(error.message);
  const context = data[0];
  if (!context) return null;
  const { data: l, error: readError } = context.liquidation_id
    ? await db.from("liquidations").select("id,status").eq("id", context.liquidation_id).single()
    : { data: null, error: null };
  if (readError) throw new Error(readError.message);
  const eligible = Boolean(context.released_at) && !["void", "closed"].includes(context.voucher_status);
  return <section className="space-y-3 rounded-xl border bg-card p-4">
    <h2 className="font-semibold">Liquidation</h2>
    {l ? <><p>{LIQUIDATION_LABELS[l.status]}</p><Link className="underline" href={`/liquidations/${l.id}`}>Open liquidation and settlement</Link></>
      : <><p className="text-sm text-muted-foreground">{eligible ? "Liquidation pending — the advance has already reduced cash on hand." : "Liquidation is available after cash release on an open voucher."}</p>{eligible && context.owner_id === userId ? <CreateLiquidationButton voucherId={voucherId} /> : null}</>}
  </section>;
}
