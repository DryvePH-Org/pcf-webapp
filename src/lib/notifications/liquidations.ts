import { createAdminClient } from "@/lib/supabase/admin";
import { formatPHP } from "@/lib/money";
import { LIQUIDATION_LABELS } from "@/lib/liquidation";
import { notify, recipientsByRole } from "./deliver";
export type LiquidationEvent = "liquidation.submitted" | "liquidation.reviewed" | "liquidation.settled" | "liquidation.reimbursement_approved";
export async function notifyLiquidation(id: string, event: LiquidationEvent, actor: string) {
  const db = createAdminClient();
  const { data: l, error } = await db.from("liquidations").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: links } = await db.from("fund_custodians").select("custodian_id").eq("fund_id", l.fund_id);
  const include = [l.owner_id, ...(links ?? []).map(row => row.custodian_id)];
  const { data: fund } = await db.from("funds").select("approval_threshold").eq("id", l.fund_id).single();
  const needsApprover = event === "liquidation.reviewed" && l.status === "approved" && l.total_spent > l.amount_received && l.total_spent >= (fund?.approval_threshold ?? 0);
  const roles = needsApprover ? ["approver" as const, "admin" as const] : event === "liquidation.submitted" ? ["admin" as const] : [];
  const recipients = await recipientsByRole(roles, { include, exclude: [actor] });
  const heading = event === "liquidation.settled" ? "Cash settlement recorded" : event === "liquidation.reimbursement_approved" ? "Additional reimbursement approved" : LIQUIDATION_LABELS[l.status];
  await notify({ event, entityType: "liquidations", entityId: id, recipients, subject: `${l.pcv_number}: ${heading}`,
    content: () => ({ tone: l.status === "flagged" ? "alert" : "info", heading, paragraphs: l.review_note ? [l.review_note] : [],
      rows: [{ label: "Employee", value: l.employee_name }, { label: "Advance", value: formatPHP(l.amount_received) }, { label: "Spent", value: formatPHP(l.total_spent) }],
      cta: { label: "Open liquidation", path: `/liquidations/${id}` } }) });
}
