import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { LedgerExportList } from "@/components/accounting/ledger-export-list";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowDatabase } from "@/lib/workflow";
import { FileSpreadsheet } from "lucide-react";

export default async function LedgerExportPage() {
  const user = await requireUser("/accounting/export");
  const supabase = await createClient();
  const funds = await supabase.from("funds").select("id, name").eq("is_active", true).order("created_at");
  if (funds.error) throw new Error(funds.error.message);
  const templates = await (supabase as unknown as SupabaseClient<WorkflowDatabase>).from("fund_export_templates").select("fund_id, file_name, uploaded_at");
  if (templates.error) throw new Error(templates.error.message);
  const byFund = new Map((templates.data ?? []).map((row) => [row.fund_id, row]));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Excel ledger export"
        description="Download each fund's ledger as an Excel file, built from the app's own records."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/accounting" />}>
            <ArrowLeft />
            Accounting
          </Button>
        }
      />
      <Alert>
        <AlertDescription>
          The numbers come from the app&apos;s database, not from the Google Sheet. Each file keeps the fund&apos;s own layout and formulas, and holds only the current period (the first ledger tab of the template you upload); older periods are not included. Amounts typed by hand into the sheet (such as input VAT or an additional fund) are not in the app and stay as the template has them. “Check first” shows whether the file closes at the balance the app expects.
        </AlertDescription>
      </Alert>
      {funds.data.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No funds yet" description="Add a fund before exporting its ledger." />
      ) : (
        <LedgerExportList
          canUpload={user.role === "admin"}
          funds={funds.data.map((fund) => ({
            id: fund.id,
            name: fund.name,
            template: byFund.has(fund.id) ? { fileName: byFund.get(fund.id)!.file_name, uploadedAt: byFund.get(fund.id)!.uploaded_at } : null,
          }))}
        />
      )}
    </div>
  );
}
