import { BarChart3 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function ReportsPage() {
  await requireUser("/reports");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Spending by category and period, plus fund activity summaries."
      />
      <EmptyState
        icon={BarChart3}
        title="No data to report"
        description="Charts and summaries will populate once vouchers are recorded."
      />
    </div>
  );
}
