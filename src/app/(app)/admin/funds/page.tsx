import { FundsManager } from "@/components/admin/funds-manager";
import type { FundRow } from "@/components/admin/types";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminFundsPage() {
  await requireUser("/admin/funds");
  const supabase = await createClient();

  const [fundsResult, custodiansResult, linksResult] = await Promise.all([
    supabase
      .from("funds")
      .select(
        "id, name, amount, per_txn_limit, approval_threshold, low_balance_pct, is_active",
      )
      .order("created_at"),
    supabase
      .from("profiles")
      .select("id, full_name, is_active")
      .eq("role", "custodian")
      .order("full_name"),
    supabase.from("fund_custodians").select("fund_id, custodian_id"),
  ]);

  if (fundsResult.error) throw new Error(fundsResult.error.message);
  if (custodiansResult.error) throw new Error(custodiansResult.error.message);
  if (linksResult.error) throw new Error(linksResult.error.message);

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
