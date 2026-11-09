import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { VoucherForm } from "@/components/vouchers/voucher-form";
import type { FundOption } from "@/components/vouchers/types";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/vouchers/${id}/edit`);
  const supabase = await createClient();

  const { data: voucher, error } = await supabase
    .from("vouchers")
    .select("id, fund_id, status, prepared_by, voucher_date, payee, pcv_number, paper_pcv_number")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!voucher) notFound();
  // Only the preparer can correct a draft; everything else is read-only.
  if (voucher.status !== "draft" || voucher.prepared_by !== user.id) {
    redirect(`/vouchers/${id}`);
  }

  const [itemsResult, fundResult] = await Promise.all([
    supabase
      .from("voucher_items")
      .select("particulars, amount, category_id")
      .eq("voucher_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("funds")
      .select("id, name, per_txn_limit, approval_threshold")
      .eq("id", voucher.fund_id)
      .single(),
  ]);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (fundResult.error) throw new Error(fundResult.error.message);

  const fund: FundOption = {
    id: fundResult.data.id,
    name: fundResult.data.name,
    per_txn_limit: String(fundResult.data.per_txn_limit),
    approval_threshold: String(fundResult.data.approval_threshold),
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${voucher.pcv_number}`}
        description="Correct the payee, voucher number, date, or particulars of this draft."
      />
      <VoucherForm
        funds={[fund]}
        edit={{
          id: voucher.id,
          fund_id: voucher.fund_id,
          voucher_date: voucher.voucher_date,
          payee: voucher.payee,
          paper_pcv_number: voucher.paper_pcv_number,
          items: itemsResult.data.map((item) => ({
            particulars: item.particulars,
            amount: Number(item.amount).toFixed(2),
            category_id: item.category_id,
          })),
        }}
      />
    </div>
  );
}
