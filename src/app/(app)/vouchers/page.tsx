import { ReceiptText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function VouchersPage() {
  await requireUser("/vouchers");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vouchers"
        description="Record expenses, attach receipts, and follow each voucher to closure."
      />
      <EmptyState
        icon={ReceiptText}
        title="No vouchers yet"
        description="Voucher recording, filters, and search will be available here."
      />
    </div>
  );
}
