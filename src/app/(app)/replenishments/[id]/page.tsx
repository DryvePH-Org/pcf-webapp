import { RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function ReplenishmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser("/replenishments");
  const { id } = await params;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Replenishment ${id.slice(0, 8).toUpperCase()}`}
        description="Amount, linked vouchers, and review history."
      />
      <EmptyState
        icon={RefreshCw}
        title="Replenishment detail"
        description="The full request and available actions will appear here."
      />
    </div>
  );
}
