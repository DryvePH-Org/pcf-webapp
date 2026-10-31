import { Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function AdminUsersPage() {
  await requireUser("/admin/users");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage accounts, roles, and access."
      />
      <EmptyState
        icon={Users}
        title="User management"
        description="User creation and role assignment will be available here."
      />
    </div>
  );
}
