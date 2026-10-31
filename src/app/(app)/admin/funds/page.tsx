import { Landmark } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function AdminFundsPage() {
  await requireUser("/admin/funds");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funds"
        description="Fund amounts, per-transaction limits, and assigned custodians."
      />
      <EmptyState
        icon={Landmark}
        title="Fund settings"
        description="Fund configuration will be editable here."
      />
    </div>
  );
}
