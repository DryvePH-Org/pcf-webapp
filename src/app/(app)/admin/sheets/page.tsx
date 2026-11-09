import { requireUser } from "@/lib/auth";
import { WorkbookAssignments } from "@/components/sheets/workbook-assignments";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default async function SheetsAssignmentsPage() {
  await requireUser("/admin/sheets");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Google Sheets assignments"
        description="Choose which workbook and fund each approving custodian handles."
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/accounting" />}
          >
            Accounting dashboard
          </Button>
        }
      />
      <WorkbookAssignments />
    </div>
  );
}
