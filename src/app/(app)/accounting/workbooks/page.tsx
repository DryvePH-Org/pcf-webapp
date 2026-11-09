import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { WorkbookAssignments } from "@/components/sheets/workbook-assignments";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
export default async function AccountingWorkbooksPage() {
  await requireUser("/accounting/workbooks");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Workbook assignments"
        description="Choose the custodian, fund, and active worksheet for each PCF workbook."
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/funds" />}
            >
              Fund assignments
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/accounting" />}
            >
              Accounting dashboard
            </Button>
          </>
        }
      />
      <WorkbookAssignments />
    </div>
  );
}
