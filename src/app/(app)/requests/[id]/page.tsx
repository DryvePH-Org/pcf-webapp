import { VoucherLiquidationPanel } from "@/components/liquidations/voucher-liquidation-panel";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { PrintButton } from "@/components/layout/print-button";
import { RequestActions } from "@/components/requests/request-actions";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import { Callout } from "@/components/shared/callout";
import { FlowSteps, type FlowStep } from "@/components/shared/flow-steps";
import { RequestStatusPill } from "@/components/shared/flow-status-pills";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/dates";
import { LIQUIDATION_LABELS } from "@/lib/liquidation";
import { shortRef } from "@/lib/refs";
import { formatPHP } from "@/lib/money";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowDatabase } from "@/lib/workflow";
import { canAccessRoute, canPerform } from "@/lib/permissions";
import { requestStatusLabel } from "@/lib/request-status";

const liquidationLabel = (status: string) => LIQUIDATION_LABELS[status] ?? status;

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("/requests");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: request, error } = await supabase.from("budget_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!request) notFound();
  const [{ data: vouchers, error: voucherError }, { data: funds, error: fundError }] = await Promise.all([
    supabase.rpc("request_voucher_summary", { p_request_id: id }),
    supabase.rpc("list_request_funds"),
  ]);
  if (voucherError) throw new Error(voucherError.message);
  if (fundError) throw new Error(fundError.message);
  const fund = funds.find(f => f.id === request.fund_id);
  const { data: assignments, error: assignmentError } = user.role === "custodian"
    ? await supabase.from("fund_custodians").select("fund_id").eq("fund_id", request.fund_id).eq("custodian_id", user.id)
    : { data: [], error: null };
  if (assignmentError) throw new Error(assignmentError.message);
  // A custodian's own request goes to the fund's assigned approver, not to another custodian.
  const wf = supabase as unknown as SupabaseClient<WorkflowDatabase>;
  const [selfResult, gatedResult, approverResult, routesResult] = await Promise.all([
    request.requester_id === user.id && user.role === "custodian"
      ? wf.rpc("self_approval_allowed", { p_fund: request.fund_id, p_user: user.id })
      : { data: false, error: null },
    wf.rpc("request_needs_fund_approver", { p_fund: request.fund_id, p_requester: request.requester_id }),
    // The fund's assigned approver can review a custodian's own request whether or not the fund also allows self-approval.
    user.role === "approver" ? wf.rpc("approver_reviews_owner", { p_fund: request.fund_id, p_owner: request.requester_id }) : { data: false, error: null },
    wf.rpc("list_fund_review_routes"),
  ]);
  if (gatedResult.error) throw new Error(gatedResult.error.message);
  if (approverResult.error) throw new Error(approverResult.error.message);
  const gated = Boolean(gatedResult.data);
  // Where the fund allows it, a custodian approves her own request (and every step is audited).
  const selfApproval = Boolean(selfResult.data);
  const approverNames = (routesResult.data ?? []).find(route => route.fund_id === request.fund_id)?.approver_names ?? [];
  const reviewerNames = gated ? approverNames : fund?.custodian_names ?? [];
  const canManage =
    canPerform(user.role, "request.review") &&
    (request.requester_id !== user.id || selfApproval) &&
    (user.role === "admin" ||
      (user.role === "custodian" && Boolean(assignments?.length) && !gated) ||
      (user.role === "approver" && Boolean(approverResult.data)));
  const voucher = vouchers[0];
  const { data: liquidation } = voucher
    ? await supabase.from("liquidations").select("id, status").eq("voucher_id", voucher.id).maybeSingle()
    : { data: null };
  const isOwner = request.requester_id === user.id;
  const released = Boolean(voucher?.released_at);

  const steps: FlowStep[] = [
    { label: "Requested", state: "done", hint: formatDate(request.created_at) },
    {
      label: gated ? "Approver review" : "Custodian review",
      state: request.status === "submitted" ? "current" : request.status === "rejected" || request.status === "cancelled" ? "stopped" : "done",
      hint: request.status === "rejected" ? "Rejected" : request.status === "cancelled" ? "Cancelled" : request.status === "submitted" ? "Waiting" : "Approved",
    },
    {
      label: "Voucher",
      state: request.status === "voucher_created" ? "done" : request.status === "approved" ? "current" : "todo",
    },
    {
      label: "Cash released",
      state: released ? "done" : voucher ? "current" : "todo",
    },
    {
      label: "Liquidation",
      state: liquidation?.status === "approved" ? "done" : released ? "current" : "todo",
      hint: liquidation ? liquidationLabel(liquidation.status) : undefined,
    },
  ];

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="print:hidden">
        <PageHeader
          title={`Budget request ${shortRef(request.request_no)}`}
          description={`${request.requester_name} · ${request.fund_name}`}
          actions={
            <>
              <PrintButton />
              <CsvExportButton filename={`${request.request_no}.csv`} header={["Request", "Name", "Fund", "Budget", "Purpose", "Status", "Review note"]} rows={[[request.request_no, request.requester_name, request.fund_name, request.amount, request.purpose, requestStatusLabel(request.status), request.review_note ?? ""]]} />
              <Button variant="outline" nativeButton={false} render={<Link href="/requests" />}>All requests</Button>
            </>
          }
        />
      </div>

      {nextStep(request.status, { canManage, isOwner, gated, approverNames, released, reviewNote: request.review_note, liquidation: liquidation?.status ?? null })}

      {voucher ? <VoucherLiquidationPanel top voucherId={voucher.id} userId={user.id} /> : null}

      <FlowSteps steps={steps} label="Request progress" />

      <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6 print:rounded-none print:border-black print:bg-white print:text-black">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Budget request</h2>
            <p className="font-mono text-sm text-muted-foreground print:text-black" title={request.request_no}>{request.request_no}</p>
          </div>
          <RequestStatusPill status={request.status} className="print:border print:border-black print:bg-white print:text-black" />
        </div>
        <div className="rounded-lg bg-muted/60 p-4">
          <p className="text-xs font-medium text-muted-foreground print:text-black">Budget requested</p>
          <p className="text-3xl font-semibold tabular-nums">{formatPHP(request.amount)}</p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={request.requester_name} />
          <Field label="Fund" value={request.fund_name} />
          <Field label={gated ? "Reviewed by the fund approver" : "Custodians who can review"} value={reviewerNames.join(", ") || "No active reviewer available"} />
          <Field label="Submitted" value={formatDateTime(request.created_at)} />
        </dl>
        <Field label="Purpose of the budget" value={request.purpose} />
        {request.reviewed_at ? (
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <Field label="Reviewed by" value={`${request.reviewer_name ?? "—"}${request.reviewed_by === request.requester_id ? " · self-approved (recorded in the audit log)" : ""}`} />
            <Field label="Reviewed on" value={formatDateTime(request.reviewed_at)} />
            {request.review_note ? <div className="sm:col-span-2"><Field label="Review note" value={request.review_note} /></div> : null}
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground print:text-black">Approving a request does not release cash. The linked voucher follows the fund&apos;s approval limit and release rules.</p>
      </section>

      {voucher ? (
        <section className="space-y-3 rounded-xl border p-4 sm:p-6 print:border-black">
          <h2 className="font-semibold">Linked petty cash voucher</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              {canAccessRoute(user.role, "/vouchers") && (user.role !== "custodian" || Boolean(assignments?.length)) ? (
                <Link href={`/vouchers/${voucher.id}`} className="font-mono font-semibold underline underline-offset-4">{voucher.pcv_number}</Link>
              ) : (
                <p className="font-mono font-semibold">{voucher.pcv_number}</p>
              )}
              <p className="text-sm text-muted-foreground">{voucher.released_at ? `Cash released ${formatDateTime(voucher.released_at)}` : "Cash has not been released yet."}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-lg font-semibold tabular-nums">{formatPHP(voucher.amount)}</span>
              <StatusBadge status={voucher.status} />
            </div>
          </div>
        </section>
      ) : null}

      {voucher ? <VoucherLiquidationPanel voucherId={voucher.id} userId={user.id} /> : null}

      <RequestActions id={id} canReview={canManage && request.status === "submitted"} canCreateVoucher={canManage && request.status === "approved"} canCancel={(request.requester_id === user.id || user.role === "admin") && ["submitted", "approved"].includes(request.status)} />
    </div>
  );
}

function nextStep(
  status: string,
  ctx: { canManage: boolean; isOwner: boolean; gated: boolean; approverNames: string[]; released: boolean; reviewNote: string | null; liquidation: string | null },
) {
  switch (status) {
    case "submitted":
      return ctx.canManage ? (
        <Callout tone="warning" title="This request needs your review">
          Approve it so a voucher can be prepared, or reject it with a reason. No cash moves yet.
        </Callout>
      ) : (
        <Callout tone="info" title={ctx.gated ? (ctx.isOwner ? "Waiting for the fund approver to review your request" : "Waiting for the fund approver") : ctx.isOwner ? "Waiting for a custodian to review your request" : "Waiting for custodian review"}>
          {ctx.gated ? `A custodian's own request is reviewed by the fund approver${ctx.approverNames.length ? `: ${ctx.approverNames.join(", ")}` : ""}.` : ctx.isOwner ? "You will get an email when it is approved or rejected." : "A custodian of this fund reviews it first."}
        </Callout>
      );
    case "approved":
      return ctx.canManage ? (
        <Callout tone="warning" title="Approved. Next: create the voucher">
          Choose Create linked voucher below to prepare the voucher and release the cash.
        </Callout>
      ) : (
        <Callout tone="info" title={ctx.gated ? "Approved. The fund approver will prepare your voucher" : "Approved. The custodian will prepare your voucher"}>
          Cash is handed over only after the voucher is released.
        </Callout>
      );
    case "rejected":
      return (
        <Callout tone="danger" title="This request was rejected">
          {ctx.reviewNote ? <>Reason: {ctx.reviewNote}</> : "No reason was given."}
        </Callout>
      );
    case "cancelled":
      return <Callout tone="neutral" title="This request was cancelled">It stays in the history; no voucher can be created from it.</Callout>;
    case "voucher_created":
      if (ctx.released && ctx.liquidation === "flagged") {
        return <Callout tone="danger" title="The liquidation needs corrections">The custodian sent it back. Open the liquidation below, fix it and submit again.</Callout>;
      }
      if (ctx.released && ctx.liquidation === "submitted") {
        return <Callout tone="info" title="Liquidation submitted. Waiting for the custodian">Nothing more to do until they respond.</Callout>;
      }
      if (ctx.released && ctx.liquidation === "approved") {
        return <Callout tone="success" title="Liquidation approved">The expenses are accepted. Any cash to return or reimburse is settled with the custodian.</Callout>;
      }
      if (ctx.released && ctx.liquidation === "draft") {
        return <Callout tone="warning" title="Your liquidation is a draft">Finish it and submit it for review.</Callout>;
      }
      return ctx.released ? (
        <Callout tone="warning" title="Cash released. Next: file your liquidation">
          Report what you actually spent and attach the receipts. Use the Liquidation card below.
        </Callout>
      ) : (
        <Callout tone="info" title="Voucher created. Waiting for the cash to be released">
          The voucher may still need approval before the custodian can hand over the cash.
        </Callout>
      );
    default:
      return null;
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[13px] font-medium text-muted-foreground print:text-black">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd></div>;
}
