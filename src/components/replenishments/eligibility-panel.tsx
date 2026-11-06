import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/money";
export async function ReplenishmentEligibilityPanel({ page = 1 }: { page?: number }) {
  const db = await createClient();
  const { data, error, count } = await db.from("replenishment_eligibility_v").select("*", { count: "exact" }).is("replenishment_id", null).neq("voucher_status", "closed").order("voucher_id").range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error(error.message);
  return <section className="space-y-3 rounded-xl border bg-card p-4">
    <h2 className="font-semibold">Released vouchers awaiting replenishment</h2>
    <p className="text-sm text-muted-foreground">All released, unbundled vouchers are shown, including pending or flagged liquidations. Only approved, settled, unflagged expenses can be bundled. {count ?? 0} records · Page {page}.</p>
    {(data ?? []).map(row => <div key={row.voucher_id} className="space-y-1 border-t pt-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><Link className="font-medium underline" href={`/vouchers/${row.voucher_id}`}>{row.pcv_number}</Link><span>{row.eligible ? "Ready to replenish" : row.exclusion_reason}</span></div><p>{row.payee} · Advance {formatPHP(row.advance_amount ?? 0)} · Spent {row.total_spent === null ? "Not filed" : formatPHP(row.total_spent)}</p>{row.liquidation_id ? <Link className="underline" href={`/liquidations/${row.liquidation_id}`}>Review liquidation and receipts</Link> : null}</div>)}
    <div className="flex justify-between text-sm">{page > 1 ? <Link className="underline" href={`?queue=${page - 1}`}>Previous vouchers</Link> : <span />}{page * 20 < (count ?? 0) ? <Link className="underline" href={`?queue=${page + 1}`}>More vouchers</Link> : null}</div>
  </section>;
}
