import { Tags } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function AdminCategoriesPage() {
  await requireUser("/admin/categories");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Expense categories used on vouchers and reports."
      />
      <EmptyState
        icon={Tags}
        title="Category settings"
        description="Adding and archiving categories will be available here."
      />
    </div>
  );
}
