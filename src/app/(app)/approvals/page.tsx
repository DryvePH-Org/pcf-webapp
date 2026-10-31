import { ClipboardCheck } from "lucide-react";

import { ApprovalsBoard } from "@/components/approvals/approvals-board";
import type { ApprovalItem } from "@/components/approvals/types";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ApprovalsPage() {
  const user = await requireUser("/approvals");
  const supabase = await createClient();

  const { data: vouchers, error } = await supabase
    .from("vouchers")
    .select(
      "id, pcv_number, voucher_date, payee, particulars, amount, category_id, fund_id, receipt_path, no_receipt_reason, prepared_by, released_at",
    )
    .eq("status", "released")
    .neq("prepared_by", user.id)
    .order("released_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const [categoriesResult, fundsResult] = await Promise.all([
    supabase.from("categories").select("id, name"),
    supabase.from("funds").select("id, name"),
  ]);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (fundsResult.error) throw new Error(fundsResult.error.message);

  const categoryNames = new Map(
    categoriesResult.data.map((category) => [category.id, category.name]),
  );
  const fundNames = new Map(
    fundsResult.data.map((fund) => [fund.id, fund.name]),
  );

  const preparedByIds = [...new Set(vouchers.map((voucher) => voucher.prepared_by))];
  const preparedByNames = new Map<string, string>();
  if (preparedByIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", preparedByIds);
    if (profileError) throw new Error(profileError.message);
    for (const profile of profiles) {
      preparedByNames.set(profile.id, profile.full_name);
    }
  }

  const receiptUrls = new Map<string, string | null>();
  await Promise.all(
    vouchers.map(async (voucher) => {
      if (!voucher.receipt_path) {
        receiptUrls.set(voucher.id, null);
        return;
      }
      const { data: signed } = await supabase.storage
        .from("receipts")
        .createSignedUrl(voucher.receipt_path, 3600);
      receiptUrls.set(voucher.id, signed?.signedUrl ?? null);
    }),
  );

  const items: ApprovalItem[] = vouchers.map((voucher) => ({
    id: voucher.id,
    pcv_number: voucher.pcv_number,
    voucher_date: voucher.voucher_date,
    payee: voucher.payee,
    particulars: voucher.particulars,
    amount: String(voucher.amount),
    category_name: categoryNames.get(voucher.category_id) ?? "—",
    fund_name: fundNames.get(voucher.fund_id) ?? "—",
    prepared_by: voucher.prepared_by,
    prepared_by_name: preparedByNames.get(voucher.prepared_by) ?? "—",
    released_at: voucher.released_at,
    receipt_url: receiptUrls.get(voucher.id) ?? null,
    no_receipt_reason: voucher.no_receipt_reason,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Released cash awaiting review, oldest first. Approving confirms the receipt now that the cash is out."
        actions={
          <Badge variant="secondary">{items.length} waiting</Badge>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Queue clear"
          description="Released vouchers appear here for review. Flag one when the receipt or particulars need correcting."
        />
      ) : (
        <ApprovalsBoard items={items} viewerId={user.id} />
      )}
    </div>
  );
}
