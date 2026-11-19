import { FundsManager } from "@/components/admin/funds-manager";
import type { FundRow } from "@/components/admin/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowDatabase } from "@/lib/workflow";

export default async function AdminFundsPage() {
  await requireUser("/admin/funds");
  const supabase = await createClient();

  const workflow = supabase as unknown as SupabaseClient<WorkflowDatabase>;
  const [fundsResult, custodiansResult, linksResult, tagsResult] = await Promise.all([
    workflow
      .from("funds")
      .select(
        "id, name, amount, per_txn_limit, approval_threshold, low_balance_pct, is_active, sheet_ledger",
      )
      .order("created_at"),
    supabase
      .from("profiles")
      .select("id, full_name, is_active")
      .eq("role", "custodian")
      .order("full_name"),
    supabase.from("fund_custodians").select("fund_id, custodian_id"),
    workflow.from("fund_expense_tags").select("fund_id, tag, position").order("position"),
  ]);

  if (fundsResult.error) throw new Error(fundsResult.error.message);
  if (custodiansResult.error) throw new Error(custodiansResult.error.message);
  if (linksResult.error) throw new Error(linksResult.error.message);
  if (tagsResult.error) throw new Error(tagsResult.error.message);

  const custodians = custodiansResult.data;
  const custodianNames = new Map(
    custodians.map((custodian) => [custodian.id, custodian.full_name]),
  );

  const custodianIdsByFund = new Map<string, string[]>();
  for (const link of linksResult.data) {
    custodianIdsByFund.set(link.fund_id, [
      ...(custodianIdsByFund.get(link.fund_id) ?? []),
      link.custodian_id,
    ]);
  }

  const funds: FundRow[] = fundsResult.data.map((fund) => ({
    id: fund.id,
    name: fund.name,
    amount: String(fund.amount),
    per_txn_limit: String(fund.per_txn_limit),
    approval_threshold: String(fund.approval_threshold),
    low_balance_pct: fund.low_balance_pct,
    sheet_ledger: fund.sheet_ledger,
    expense_tags: (tagsResult.data ?? []).filter((row) => row.fund_id === fund.id).map((row) => row.tag),
    custodian_ids: custodianIdsByFund.get(fund.id) ?? [],
    custodian_names: (custodianIdsByFund.get(fund.id) ?? []).map(
      (id) => custodianNames.get(id) ?? "—",
    ),
  }));

  return (
    <FundsManager
      funds={funds}
      custodians={custodians
        .filter((custodian) => custodian.is_active)
        .map(({ id, full_name }) => ({ id, full_name }))}
    />
  );
}
