import { ScrollText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function AuditPage() {
  await requireUser("/audit");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Every status change and financial action, in order."
      />
      <EmptyState
        icon={ScrollText}
        title="No activity yet"
        description="Audit entries will appear here as vouchers and replenishments move."
      />
    </div>
  );
}
