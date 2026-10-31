import { RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function ReplenishmentsPage() {
  await requireUser("/replenishments");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Replenishments"
        description="Request and review fund replenishments to restore the imprest balance."
      />
      <EmptyState
        icon={RefreshCw}
        title="No replenishments"
        description="Replenishment requests, accounting review, and closure will be managed here."
      />
    </div>
  );
}
