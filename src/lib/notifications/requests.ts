import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowDatabase } from "@/lib/workflow";
import { formatPHP } from "@/lib/money";
import { shortRef } from "@/lib/refs";
import { requestStatusLabel } from "@/lib/request-status";
import { notify, recipientsByRole } from "./deliver";
import { reviewersFor } from "./routing";

export type BudgetRequestEvent = "budget.submitted" | "budget.reviewed" | "budget.cancelled" | "budget.voucher_created";

type RequestRecord = Awaited<ReturnType<typeof loadRequest>>;
async function loadRequest(id: string) {
  const admin = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  const { data, error } = await admin.from("budget_requests").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// Tell the fund's approvers (or the administrators, where none is assigned) that a request waits for them.
// inApp: false is used when the in-app notice already exists and only the email is missing.
async function notifyApprovers(request: RequestRecord, skip: string[], options: { inApp?: boolean } = {}) {
  const admin = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  const ref = shortRef(request.request_no);
  const fundApprovers = await admin.from("fund_approvers").select("approver_id").eq("fund_id", request.fund_id);
  const ids = (fundApprovers.data ?? []).map((row) => row.approver_id);
  await notify({
    event: "budget.needs_approver", entityType: "budget_requests", entityId: request.id,
    inApp: options.inApp,
    recipients: await recipientsByRole(ids.length ? [] : ["admin"], { include: ids, exclude: skip }),
    subject: `${ref}: budget request needs your approval`,
    content: () => ({
      tone: "action", heading: "Budget request needs your approval",
      paragraphs: [request.purpose, `${formatPHP(request.amount)} reaches the fund's approval limit. The custodian approved it. An approver has to approve it before its voucher can be created.`],
      rows: [{ label: "Requester", value: request.requester_name }, { label: "Fund", value: request.fund_name }, { label: "Budget", value: formatPHP(request.amount) }],
      cta: { label: "Open budget request", path: `/requests/${request.id}` },
    }),
  });
}

// Requests the database sweep sent back to their approver (after a fund's limits changed): the in-app notice
// was made by the sweep, so only the email is sent here. Safe to run any number of times.
export async function emailResyncedRequests() {
  const admin = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  const pending = await admin.from("request_approval_emails").select("request_id").is("emailed_at", null).limit(50);
  if (pending.error) throw pending.error;
  for (const row of pending.data ?? []) {
    try {
      const request = await loadRequest(row.request_id);
      // It may have been decided since; only a request still waiting needs the email.
      if (request.status === "awaiting_approver") {
        await notifyApprovers(request, [request.requester_id, ...(request.reviewed_by ? [request.reviewed_by] : [])], { inApp: false });
      }
    } catch (error) {
      console.error("approver email failed", row.request_id, error);
      continue;
    }
    await admin.from("request_approval_emails").update({ emailed_at: new Date().toISOString() }).eq("request_id", row.request_id);
  }
}

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
    await notifyApprovers(request, [actorId, request.requester_id, ...(request.reviewed_by ? [request.reviewed_by] : [])]);
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
