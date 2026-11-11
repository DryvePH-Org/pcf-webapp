import { requireUser } from "@/lib/auth";
import { WorkbookAssignments } from "@/components/sheets/workbook-assignments";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GrokbotSimulation } from "@/components/sheets/grokbot-simulation";
import { getGrokbotSimulation } from "@/actions/grokbot";
export default async function SheetsAssignmentsPage() {
  const user = await requireUser("/admin/sheets");
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
      {user.role === "admin" ? <GrokbotSimulation initial={await getGrokbotSimulation()}/> : null}
    </div>
  );
}
