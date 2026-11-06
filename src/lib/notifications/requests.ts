import { createAdminClient } from "@/lib/supabase/admin";
import { formatPHP } from "@/lib/money";
import { requestStatusLabel } from "@/lib/request-status";
import { notify, recipientsByRole } from "./deliver";

export type BudgetRequestEvent = "budget.submitted" | "budget.reviewed" | "budget.cancelled" | "budget.voucher_created";

// Event hooks are ready; final email-provider configuration remains a later phase.
export async function notifyBudgetRequest(id: string, event: BudgetRequestEvent, actorId: string) {
  const admin = createAdminClient();
  const { data: request, error } = await admin.from("budget_requests").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: links, error: linkError } = await admin.from("fund_custodians").select("custodian_id").eq("fund_id", request.fund_id);
  if (linkError) throw linkError;
  const include = event === "budget.submitted" || event === "budget.cancelled"
    ? [...links.map(row => row.custodian_id), request.requester_id]
    : [request.requester_id];
  const recipients = await recipientsByRole(event === "budget.submitted" ? ["admin"] : [], { include, exclude: [actorId] });
  const heading = event === "budget.submitted" ? "Budget request needs review" : event === "budget.voucher_created" ? "Your budget request has a voucher" : requestStatusLabel(request.status);
  await notify({
    event, entityType: "budget_requests", entityId: id, recipients,
    subject: `${request.request_no}: ${heading}`,
    content: () => ({
      tone: request.status === "rejected" ? "alert" : "info",
      heading, paragraphs: [request.purpose],
      rows: [
        { label: "Requester", value: request.requester_name }, { label: "Fund", value: request.fund_name },
        { label: "Budget", value: formatPHP(request.amount) }, { label: "Status", value: requestStatusLabel(request.status) },
        ...(request.review_note ? [{ label: "Review note", value: request.review_note }] : []),
      ],
      cta: { label: "Open budget request", path: `/requests/${id}` },
    }),
  });
}
