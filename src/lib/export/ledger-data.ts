import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowDatabase } from "@/lib/workflow";
import type { SheetsDatabase } from "@/lib/sheets/types";

import type { LedgerEntry } from "./ledger-fill";

export type FundLedger = {
  fund: { id: string; name: string; amount: number };
  entries: LedgerEntry[];
  // What the fund should hold once every approved liquidation is counted: the fund amount
  // less what was spent. This is the balance the Google Sheet is also held against.
  expectedClosing: number;
};

const cents = (value: number) => Math.round(value * 100);

// The current period's ledger, worked out from the app's own tables only (never from the
// Google Sheet's copy). The period is the same set the dashboard counts as still open:
// released vouchers that no replenishment has closed.
export async function loadFundLedger(fundId: string): Promise<FundLedger> {
  const db = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  const sheets = createAdminClient() as unknown as SupabaseClient<SheetsDatabase>;

  const fund = await db.from("funds").select("id, name, amount").eq("id", fundId).maybeSingle();
  if (fund.error) throw new Error("Could not read the fund.");
  if (!fund.data) throw new Error("Fund not found.");

  const vouchers = await db
    .from("vouchers")
    .select("id, pcv_number, paper_pcv_number, flow_version")
    .eq("fund_id", fundId)
    .not("released_at", "is", null)
    .in("status", ["released", "approved", "rejected"])
    .limit(1000);
  if (vouchers.error) throw new Error("Could not read the vouchers.");
  const voucherIds = (vouchers.data ?? []).map((row) => row.id);
  if (!voucherIds.length) return { fund: fund.data, entries: [], expectedClosing: Number(fund.data.amount) };

  const liquidations = await db
    .from("liquidations")
    .select("id, voucher_id, employee_name, total_spent, reviewed_at")
    .in("voucher_id", voucherIds)
    .eq("status", "approved");
  if (liquidations.error) throw new Error("Could not read the liquidations.");
  const approved = liquidations.data ?? [];
  const liquidationIds = approved.map((row) => row.id);
  if (!liquidationIds.length) return { fund: fund.data, entries: [], expectedClosing: Number(fund.data.amount) };

  const [receipts, items, categories, jobs] = await Promise.all([
    db.from("liquidation_receipt_lines").select("*").in("liquidation_id", liquidationIds).order("position"),
    db.from("liquidation_items").select("*").in("liquidation_id", liquidationIds).order("position"),
    db.from("categories").select("id, name"),
    // The order the lines reached the sheet, so the export reads the same as the sheet does.
    sheets.from("sheet_jobs").select("liquidation_id, status, updated_at").in("liquidation_id", liquidationIds).eq("status", "synced"),
  ]);
  if (receipts.error || items.error || categories.error || jobs.error) throw new Error("Could not read the expense lines.");

  const voucherOf = new Map((vouchers.data ?? []).map((row) => [row.id, row]));
  const categoryName = new Map((categories.data ?? []).map((row) => [row.id, row.name]));
  const syncedAt = new Map((jobs.data ?? []).map((row) => [row.liquidation_id, row.updated_at]));

  const ordered = [...approved].sort((a, b) => {
    const left = syncedAt.get(a.id) ?? a.reviewed_at ?? "";
    const right = syncedAt.get(b.id) ?? b.reviewed_at ?? "";
    return left < right ? -1 : left > right ? 1 : 0;
  });

  const entries: LedgerEntry[] = [];
  let spent = 0;
  for (const liquidation of ordered) {
    const voucher = voucherOf.get(liquidation.voucher_id);
    // A voucher on the new flow carries the number printed on the paper voucher; that is the
    // number the sheet shows in its PCF# column.
    const number = voucher && voucher.flow_version === 2 ? voucher.paper_pcv_number || voucher.pcv_number : (voucher?.pcv_number ?? "");
    spent += cents(Number(liquidation.total_spent));
    const lines = (receipts.data ?? []).filter((row) => row.liquidation_id === liquidation.id);
    if (lines.length) {
      for (const line of lines)
        entries.push({
          date: line.expense_date || null,
          tag: line.tag,
          voucher: number,
          particulars: line.particulars,
          plate: line.plate,
          person: liquidation.employee_name,
          payee: line.supplier,
          receipt_number: line.receipt_number,
          tin: line.tin,
          company: line.company,
          amount: Number(line.amount),
        });
      continue;
    }
    for (const item of (items.data ?? []).filter((row) => row.liquidation_id === liquidation.id)) {
      const detail = (item.sheet_details ?? {}) as Record<string, string>;
      entries.push({
        date: detail.expense_date || null,
        tag: detail.sheet_category || categoryName.get(item.category_id) || "",
        voucher: number,
        particulars: item.particulars,
        plate: detail.plate ?? "",
        person: liquidation.employee_name,
        payee: detail.supplier ?? "",
        receipt_number: detail.receipt_number ?? "",
        tin: detail.tin ?? "",
        company: detail.company ?? "",
        amount: Number(item.amount),
      });
    }
  }
  return { fund: fund.data, entries, expectedClosing: (cents(Number(fund.data.amount)) - spent) / 100 };
}
