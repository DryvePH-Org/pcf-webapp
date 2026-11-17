import { sheetsAdmin } from "@/lib/sheets/database";
import type { SheetTab } from "@/lib/sheets/types";

import { buildMoneyTrail, type MoneyTrail } from "./money-trail";

// The money trail for each fund the viewer already sees on the dashboard. It reads the
// individual vouchers, liquidations and settlements with the server's own access, so
// callers must pass only fund ids the viewer may see. The cash counted is the same as
// fund_balance_v: released vouchers that are not yet closed by a replenishment.
export async function loadMoneyTrails(funds: { id: string; amount: number }[]) {
  const trails = new Map<string, MoneyTrail>();
  if (funds.length === 0) return trails;
  const db = sheetsAdmin();
  const fundIds = funds.map((fund) => fund.id);

  const vouchers = await db
    .from("vouchers")
    .select("id, fund_id, pcv_number, payee, amount")
    .in("fund_id", fundIds)
    .not("released_at", "is", null)
    .in("status", ["released", "approved", "rejected"])
    .limit(1000);
  if (vouchers.error) throw new Error("Could not read the vouchers.");
  const voucherIds = (vouchers.data ?? []).map((row) => row.id);

  const [liquidations, settlements, workbooks] = await Promise.all([
    voucherIds.length
      ? db.from("liquidations").select("id, voucher_id, status, total_spent").in("voucher_id", voucherIds)
      : { data: [], error: null },
    voucherIds.length
      ? db.from("cash_settlements").select("voucher_id, kind, amount").in("voucher_id", voucherIds)
      : { data: [], error: null },
    db.from("sheet_workbooks").select("fund_id, active_sheet_id, catalog, last_synced_at").in("fund_id", fundIds).eq("enabled", true),
  ]);
  if (liquidations.error || settlements.error || workbooks.error) throw new Error("Could not read the money trail.");

  // Approved liquidations whose sheet update is still waiting or has failed.
  const approvedIds = (liquidations.data ?? []).filter((row) => row.status === "approved").map((row) => row.id);
  const jobs = approvedIds.length
    ? await db.from("sheet_jobs").select("liquidation_id, status").in("liquidation_id", approvedIds).neq("status", "synced")
    : { data: [], error: null };
  if (jobs.error) throw new Error("Could not read the sheet updates.");
  const unwritten = new Set((jobs.data ?? []).map((row) => row.liquidation_id));
  const voucherOfLiquidation = new Map((liquidations.data ?? []).map((row) => [row.id, row.voucher_id]));
  const notInSheetVoucherIds = [...unwritten].flatMap((id) => (voucherOfLiquidation.has(id) ? [voucherOfLiquidation.get(id) as string] : []));

  for (const fund of funds) {
    const mine = (vouchers.data ?? []).filter((row) => row.fund_id === fund.id);
    const ids = new Set(mine.map((row) => row.id));
    const workbook = (workbooks.data ?? []).find((row) => row.fund_id === fund.id);
    const tab = workbook ? (workbook.catalog as unknown as SheetTab[]).find((entry) => entry.sheetId === workbook.active_sheet_id) : undefined;
    trails.set(
      fund.id,
      buildMoneyTrail({
        fundAmount: fund.amount,
        vouchers: mine.map((row) => ({ id: row.id, pcv_number: row.pcv_number, payee: row.payee, amount: Number(row.amount) })),
        liquidations: (liquidations.data ?? [])
          .filter((row) => ids.has(row.voucher_id))
          .map((row) => ({ voucher_id: row.voucher_id, status: row.status, total_spent: Number(row.total_spent) })),
        settlements: (settlements.data ?? [])
          .filter((row) => ids.has(row.voucher_id))
          .map((row) => ({ voucher_id: row.voucher_id, kind: row.kind as "return" | "reimbursement", amount: Number(row.amount) })),
        notInSheetVoucherIds: notInSheetVoucherIds.filter((id) => ids.has(id)),
        sheet: workbook
          ? { balance: tab?.ledger?.ledger_balance ?? null, syncedAt: workbook.last_synced_at }
          : null,
      }),
    );
  }
  return trails;
}
