import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowDatabase } from "@/lib/workflow";
import { formatPHP } from "@/lib/money";
import { shortRef } from "@/lib/refs";
import { requestStatusLabel } from "@/lib/request-status";
import { notify, recipientsByRole } from "./deliver";
import { reviewersFor } from "./routing";

export type BudgetRequestEvent = "budget.submitted" | "budget.reviewed" | "budget.cancelled" | "budget.voucher_created";

export async function notifyBudgetRequest(id: string, event: BudgetRequestEvent, actorId: string) {
  const admin = createAdminClient();
  const { data: request, error } = await (admin as unknown as SupabaseClient<WorkflowDatabase>).from("budget_requests").select("*").eq("id", id).single();
  if (error) throw error;
  const ref = shortRef(request.request_no);

  // Reviewers follow the fund's rules: the other custodians, the assigned
  // approver for a custodian's own request, or nobody when the fund lets her approve it herself.
  const reviewers = await reviewersFor(request.fund_id, request.requester_id);
  const toReviewers = event === "budget.submitted" || event === "budget.cancelled";
  const recipients = toReviewers
    ? await recipientsByRole(reviewers.fallbackToAdmin ? ["admin"] : [], { include: reviewers.ids, exclude: [actorId] })
    : await recipientsByRole([], { include: [request.requester_id], exclude: [actorId] });

  // A large request the custodian approved now waits for an independent approver.
  if (event === "budget.reviewed" && request.status === "awaiting_approver") {
    const fundApprovers = await (admin as unknown as SupabaseClient<WorkflowDatabase>).from("fund_approvers").select("approver_id").eq("fund_id", request.fund_id);
    const ids = (fundApprovers.data ?? []).map((row) => row.approver_id);
    const skip = [actorId, request.requester_id, ...(request.reviewed_by ? [request.reviewed_by] : [])];
    await notify({
      event: "budget.needs_approver", entityType: "budget_requests", entityId: id,
      recipients: await recipientsByRole(ids.length ? [] : ["admin"], { include: ids, exclude: skip }),
      subject: `${ref}: budget request needs your approval`,
      content: () => ({
        tone: "action", heading: "Budget request needs your approval",
        paragraphs: [request.purpose, `${formatPHP(request.amount)} reaches the fund's approval limit. The custodian approved it. An approver has to approve it before its voucher can be created.`],
        rows: [{ label: "Requester", value: request.requester_name }, { label: "Fund", value: request.fund_name }, { label: "Budget", value: formatPHP(request.amount) }],
        cta: { label: "Open budget request", path: `/requests/${id}` },
      }),
    });
  }

  const heading =
    event === "budget.submitted" ? "Budget request needs your review"
    : event === "budget.voucher_created" ? "Your budget request has a voucher"
    : event === "budget.cancelled" ? "Budget request cancelled"
    : request.status === "awaiting_approver" ? "Your budget request is with the approver"
    : request.status === "approved" ? "Your budget request was approved"
    : request.status === "rejected" ? "Your budget request was rejected"
    : requestStatusLabel(request.status);
  const rows = [
    { label: "Requester", value: request.requester_name }, { label: "Fund", value: request.fund_name },
    { label: "Budget", value: formatPHP(request.amount) }, { label: "Status", value: requestStatusLabel(request.status) },
    ...(request.review_note ? [{ label: "Review note", value: request.review_note }] : []),
    ...(request.approver_note ? [{ label: "Approver note", value: request.approver_note }] : []),
  ];
  const paragraphs = [
    request.purpose,
    ...(event === "budget.reviewed" && request.status === "approved"
      ? ["The next step is the voucher. No cash has been released yet."] : []),
    ...(event === "budget.reviewed" && request.status === "awaiting_approver"
      ? ["The custodian approved it. Because it reaches the fund's approval limit, an approver approves it next. The voucher comes after that."] : []),
  ];
  await notify({
    event, entityType: "budget_requests", entityId: id, recipients,
    subject: `${ref}: ${heading}`,
    content: () => ({
      tone: event === "budget.submitted" ? "action" : request.status === "rejected" ? "alert" : "info",
      heading, paragraphs, rows,
      cta: { label: "Open budget request", path: `/requests/${id}` },
    }),
  });

  // Where a fund lets a custodian approve her own request, admins and accounting
  // see it in their bell (the audit log has the full record).
  if (event === "budget.reviewed" && actorId === request.requester_id) {
    await notify({
      event: "audit.self_approval", entityType: "budget_requests", entityId: id,
      recipients: await recipientsByRole(["admin", "accounting"], { exclude: [actorId] }),
      subject: `${ref}: self-approved by ${request.requester_name}`, email: false,
      content: () => ({
        tone: "info", heading: `${request.requester_name} approved their own budget request`,
        paragraphs: [`${formatPHP(request.amount)} for ${request.fund_name}. It is recorded in the audit log.`],
        cta: { label: "Open budget request", path: `/requests/${id}` },
      }),
    });
  }
}
