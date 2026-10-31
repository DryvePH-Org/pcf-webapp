import { FundsManager } from "@/components/admin/funds-manager";
import type { FundRow } from "@/components/admin/types";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AdminFundsPage() {
  await requireUser("/admin/funds");
  const supabase = await createClient();

  const [fundsResult, custodiansResult] = await Promise.all([
    supabase
      .from("funds")
      .select(
        "id, name, amount, per_txn_limit, low_balance_pct, custodian_id, is_active",
      )
      .order("created_at"),
    supabase
      .from("profiles")
      .select("id, full_name, is_active")
      .eq("role", "custodian")
      .order("full_name"),
  ]);

  if (fundsResult.error) throw new Error(fundsResult.error.message);
  if (custodiansResult.error) throw new Error(custodiansResult.error.message);

  const custodians = custodiansResult.data;
  const custodianNames = new Map(
    custodians.map((custodian) => [custodian.id, custodian.full_name]),
  );

  const funds: FundRow[] = fundsResult.data.map((fund) => ({
    id: fund.id,
    name: fund.name,
    amount: String(fund.amount),
    per_txn_limit: String(fund.per_txn_limit),
    low_balance_pct: fund.low_balance_pct,
    custodian_id: fund.custodian_id,
    custodian_name: fund.custodian_id
      ? (custodianNames.get(fund.custodian_id) ?? null)
      : null,
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
