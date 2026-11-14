import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ReceiptText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { VoucherForm } from "@/components/vouchers/voucher-form";
import type { FundOption } from "@/components/vouchers/types";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowDatabase } from "@/lib/workflow";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NewVoucherPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const user = await requireUser("/vouchers/new");
  const supabase = await createClient();

  const { request: requestId } = await searchParams;
  let request: Database["public"]["Tables"]["budget_requests"]["Row"] | undefined;
  if (requestId) {
    if (!z.uuid().safeParse(requestId).success) notFound();
    const { data, error } = await supabase.from("budget_requests").select("*").eq("id", requestId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) notFound();
    const wf = supabase as unknown as SupabaseClient<WorkflowDatabase>;
    const gated = await wf.rpc("request_needs_fund_approver", { p_fund: data.fund_id, p_requester: data.requester_id });
    if (gated.error) throw new Error(gated.error.message);
    // The fund's assigned approver can prepare a custodian's own request whether or not the fund also allows self-approval.
    const gateway = user.role === "approver"
      ? await wf.rpc("approver_reviews_owner", { p_fund: data.fund_id, p_owner: data.requester_id })
      : { data: false, error: null };
    if (gateway.error) throw new Error(gateway.error.message);
    // A custodian's own request is prepared by the fund's assigned approver; anyone else's by a custodian.
    const self = data.requester_id === user.id && user.role === "custodian"
      ? await wf.rpc("self_approval_allowed", { p_fund: data.fund_id, p_user: user.id })
      : { data: false, error: null };
    if (self.error) throw new Error(self.error.message);
    const mayPrepare = Boolean(self.data) || user.role === "admin" || (user.role === "approver" ? gateway.data === true : user.role === "custodian" && !gated.data);
    if (data.status !== "approved" || (data.requester_id === user.id && !self.data) || !mayPrepare) redirect(`/requests/${requestId}`);
    request = data;
  }

  const fundsResult = await supabase.from("funds").select("id, name, per_txn_limit, approval_threshold").eq("is_active",true).order("created_at");
  if (fundsResult.error) throw new Error(fundsResult.error.message);

  const funds: FundOption[] = fundsResult.data.filter(fund => !request || fund.id === request.fund_id).map((fund) => ({
    id: fund.id,
    name: fund.name,
    per_txn_limit: String(fund.per_txn_limit),
    approval_threshold: String(fund.approval_threshold),
  }));
  return (
    <div className="space-y-6">
      <PageHeader
        title="New voucher"
        description="Create a budget voucher. Approval limits apply before cash is released."
      />

      {funds.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={
            funds.length === 0 && user.role === "custodian"
              ? "No fund assigned yet"
              : "Setup needed first"
          }
          description={
            funds.length === 0 && user.role === "custodian"
              ? "Ask an administrator to assign you a fund before recording a voucher."
              : "Add an active fund before recording a voucher."
          }
        />
      ) : (
        <VoucherForm
          funds={funds}
          request={request ? { id: request.id, fund_id: request.fund_id, name: request.requester_name, purpose: request.purpose, amount: Number(request.amount).toFixed(2) } : undefined}
        />
      )}
    </div>
  );
}
