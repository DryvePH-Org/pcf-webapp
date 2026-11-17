import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentUser } from "@/lib/auth";
import { mayReviewOwner } from "@/lib/self-approval";
import { buildSettlementItems, type CancelledAdvance, type SettlementItem } from "@/lib/settlements-core";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowDatabase } from "@/lib/workflow";

// What the signed-in custodian, approver or administrator still has to settle in cash. It
// reads with the viewer's own access, so a person only sees the funds they work in.
export const loadSettlementsDue = cache(async (): Promise<SettlementItem[]> => {
  const user = await getCurrentUser();
  if (!user || !["custodian", "approver", "admin"].includes(user.role)) return [];
  const db = (await createClient()) as unknown as SupabaseClient<WorkflowDatabase>;

  const approved = await db
    .from("liquidations")
    .select("id, pcv_number, employee_name, fund_name, amount_received, total_spent, reviewed_at, owner_id, fund_id")
    .eq("status", "approved")
    .order("reviewed_at", { ascending: true })
    .limit(500);
  if (approved.error) throw new Error("Could not read the liquidations.");
  const liquidations = (approved.data ?? []).map((row) => ({
    ...row,
    amount_received: Number(row.amount_received),
    total_spent: Number(row.total_spent),
  }));

  const ids = liquidations.map((row) => row.id);
  const settled = ids.length ? await db.from("cash_settlements").select("liquidation_id").in("liquidation_id", ids) : { data: [], error: null };
  if (settled.error) throw new Error("Could not read the settlements.");

  // Who may record each one: the same rule the database enforces.
  const allowed = new Map<string, boolean>();
  for (const row of liquidations) {
    const key = `${row.fund_id}:${row.owner_id}`;
    if (!allowed.has(key)) allowed.set(key, await mayReviewOwner(db, user, row.fund_id, row.owner_id));
  }

  const pending = await db.from("advance_cancellations").select("voucher_id, fund_id, amount, cancelled_at").is("returned_on", null);
  if (pending.error) throw new Error("Could not read the cancelled advances.");
  const voucherIds = (pending.data ?? []).map((row) => row.voucher_id);
  const [vouchers, funds] = voucherIds.length
    ? await Promise.all([
        db.from("vouchers").select("id, pcv_number, payee").in("id", voucherIds),
        db.from("funds").select("id, name").in("id", (pending.data ?? []).map((row) => row.fund_id)),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (vouchers.error || funds.error) throw new Error("Could not read the cancelled vouchers.");
  const voucherOf = new Map((vouchers.data ?? []).map((row) => [row.id, row]));
  const fundName = new Map((funds.data ?? []).map((row) => [row.id, row.name]));

  const cancelled: CancelledAdvance[] = [];
  for (const row of pending.data ?? []) {
    const voucher = voucherOf.get(row.voucher_id);
    if (!voucher) continue;
    const state = await db.rpc("advance_cancellation_state", { p_voucher: row.voucher_id });
    cancelled.push({
      voucher_id: row.voucher_id,
      pcv_number: voucher.pcv_number,
      payee: voucher.payee,
      fund_name: fundName.get(row.fund_id) ?? "Fund",
      amount: Number(row.amount),
      cancelled_at: row.cancelled_at,
      canAct: state.data?.[0]?.can_record_return === true,
    });
  }

  return buildSettlementItems({
    liquidations,
    settledLiquidationIds: (settled.data ?? []).map((row) => row.liquidation_id),
    cancelled,
    canActOn: (row) => allowed.get(`${row.fund_id}:${row.owner_id}`) === true,
  });
});

export async function settlementBadgeCount() {
  try {
    return (await loadSettlementsDue()).filter((item) => item.canAct).length;
  } catch {
    return 0;
  }
}
