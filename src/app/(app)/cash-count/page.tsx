import { Wallet } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function CashCountPage() {
  await requireUser("/cash-count");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Count"
        description="Record counted cash and compare it against the expected fund balance."
      />
      <EmptyState
        icon={Wallet}
        title="No counts recorded"
        description="Cash counts and any variances will be listed here."
      />
    </div>
  );
}
