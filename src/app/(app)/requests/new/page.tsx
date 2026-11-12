import { OutstandingLiquidationNotice } from "@/components/liquidations/outstanding-notice";
import { PageHeader } from "@/components/layout/page-header";
import { RequestForm } from "@/components/requests/request-form";
import { requireUser } from "@/lib/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowDatabase } from "@/lib/workflow";
import { createClient } from "@/lib/supabase/server";

export default async function NewRequestPage() {
  const user = await requireUser("/requests/new");
  const supabase = await createClient();
  const outstanding = await supabase.rpc("my_outstanding_liquidations");
  if (outstanding.error)
    throw new Error("Could not check outstanding liquidations.");
  const { data, error } = await supabase.rpc("list_request_funds");
  if (error) throw new Error(error.message);
  const routesResult = await (supabase as unknown as SupabaseClient<WorkflowDatabase>).rpc("list_fund_review_routes");
  if (routesResult.error) throw new Error(routesResult.error.message);
  // Funds where the requester is a custodian and an approver is assigned: the approver reviews.
  const approverRoutes = Object.fromEntries(
    (routesResult.data ?? [])
      .filter((route) => route.i_am_custodian && route.approver_names.length)
      .map((route) => [route.fund_id, route.approver_names]),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Request a budget"
        description="Choose a fund and explain what the budget is for."
      />
      {outstanding.data.length ? (
        <OutstandingLiquidationNotice />
      ) : data.length ? (
        <RequestForm funds={data} name={user.full_name} approverRoutes={approverRoutes} />
      ) : (
        <p className="rounded-xl border p-6 text-muted-foreground">
          No funds are available for requests. A fund must be active and have an
          active custodian assigned.
        </p>
      )}
    </div>
  );
}
