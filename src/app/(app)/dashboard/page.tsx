import { LayoutDashboard } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";

export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const firstName = user.full_name.split(" ")[0] || user.full_name;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Your petty cash overview and next actions."
        actions={<Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>}
      />
      <EmptyState
        icon={LayoutDashboard}
        title="Overview coming together"
        description="The live fund balance, pending approvals, and recent voucher activity will appear here."
      />
    </div>
  );
}
