import { ClipboardCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function ApprovalsPage() {
  await requireUser("/approvals");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Submitted vouchers awaiting your decision, oldest first."
      />
      <EmptyState
        icon={ClipboardCheck}
        title="Nothing to review"
        description="Vouchers submitted for approval will appear here with their receipts."
      />
    </div>
  );
}
