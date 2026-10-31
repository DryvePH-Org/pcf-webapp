import { ReceiptText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { VoucherForm } from "@/components/vouchers/voucher-form";
import type { CategoryOption, FundOption } from "@/components/vouchers/types";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function NewVoucherPage() {
  await requireUser("/vouchers/new");
  const supabase = await createClient();

  const [fundsResult, categoriesResult] = await Promise.all([
    supabase
      .from("funds")
      .select("id, name, per_txn_limit")
      .eq("is_active", true)
      .order("created_at"),
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (fundsResult.error) throw new Error(fundsResult.error.message);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);

  const funds: FundOption[] = fundsResult.data.map((fund) => ({
    id: fund.id,
    name: fund.name,
    per_txn_limit: String(fund.per_txn_limit),
  }));
  const categories: CategoryOption[] = categoriesResult.data.map(
    (category) => ({ id: category.id, name: category.name }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="New voucher"
        description="Record a petty cash expense. Saving and releasing cash hands the money out before the approver reviews it."
      />

      {funds.length === 0 || categories.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Setup needed first"
          description="Add at least one active fund and category before recording a voucher."
        />
      ) : (
        <VoucherForm funds={funds} categories={categories} />
      )}
    </div>
  );
}
