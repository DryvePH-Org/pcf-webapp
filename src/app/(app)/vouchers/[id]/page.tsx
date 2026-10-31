import { ReceiptText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function VoucherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser("/vouchers");
  const { id } = await params;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Voucher ${id.slice(0, 8).toUpperCase()}`}
        description="Voucher details, receipt, and approval history."
      />
      <EmptyState
        icon={ReceiptText}
        title="Voucher detail"
        description="The full voucher record and available actions will appear here."
      />
    </div>
  );
}
