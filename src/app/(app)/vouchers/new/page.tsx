import { ReceiptText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function NewVoucherPage() {
  await requireUser("/vouchers");

  return (
    <div className="space-y-6">
      <PageHeader
        title="New voucher"
        description="Record a petty cash expense with its receipt and details."
      />
      <EmptyState
        icon={ReceiptText}
        title="Voucher form"
        description="The voucher entry form will appear here."
      />
    </div>
  );
}
