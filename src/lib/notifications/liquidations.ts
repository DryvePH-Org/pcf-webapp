import { createAdminClient } from "@/lib/supabase/admin";
import { formatPHP } from "@/lib/money";
import { LIQUIDATION_LABELS } from "@/lib/liquidation";
import { notify, recipientsByRole } from "./deliver";
import { reviewersFor } from "./routing";

export type LiquidationEvent = "liquidation.submitted" | "liquidation.reviewed" | "liquidation.settled" | "liquidation.reimbursement_approved";

export async function notifyLiquidation(id: string, event: LiquidationEvent, actor: string) {
  const db = createAdminClient();
  const { data: l, error } = await db.from("liquidations").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: fund } = await db.from("funds").select("approval_threshold").eq("id", l.fund_id).single();
  const rows = [
    { label: "Employee", value: l.employee_name }, { label: "Advance", value: formatPHP(l.amount_received) },
    { label: "Spent", value: formatPHP(l.total_spent) },
  ];
  const cta = { label: "Open liquidation", path: `/liquidations/${id}` };
  const needsApprover = event === "liquidation.reviewed" && l.status === "approved"
    && l.total_spent > l.amount_received && l.total_spent >= (fund?.approval_threshold ?? 0);

  if (event === "liquidation.submitted") {
    // Reviewers follow the fund's rules, the same ones the database enforces.
    const reviewers = await reviewersFor(l.fund_id, l.owner_id);
    await notify({
      event, entityType: "liquidations", entityId: id,
      recipients: await recipientsByRole(reviewers.fallbackToAdmin ? ["admin"] : [], { include: reviewers.ids, exclude: [actor] }),
      subject: `${l.pcv_number}: liquidation needs your review`,
      content: () => ({ tone: "action", heading: `${l.pcv_number} liquidation needs your review`,
        paragraphs: [`${l.employee_name} submitted their liquidation.`], rows, cta }),
    });
    return;
  }

  if (event === "liquidation.reviewed") {
    const flagged = l.status === "flagged";
    await notify({
      event: flagged ? "liquidation.flagged" : event, entityType: "liquidations", entityId: id,
      recipients: await recipientsByRole([], { include: [l.owner_id], exclude: [actor] }),
      subject: `${l.pcv_number}: ${flagged ? "corrections needed" : LIQUIDATION_LABELS[l.status]}`,
      content: () => ({ tone: flagged ? "alert" : "info",
        heading: flagged ? `${l.pcv_number} needs corrections` : `${l.pcv_number} liquidation was ${LIQUIDATION_LABELS[l.status].toLowerCase()}`,
        paragraphs: l.review_note ? [l.review_note] : flagged ? ["Fix the expenses, then submit again."] : [],
        rows, cta }),
    });
    if (needsApprover) {
      await notify({
        event: "liquidation.needs_approver", entityType: "liquidations", entityId: id,
        recipients: await recipientsByRole(["approver", "admin"], { exclude: [actor, l.owner_id] }),
        subject: `${l.pcv_number}: extra reimbursement needs approval`,
        content: () => ({ tone: "action", heading: `${l.pcv_number} needs an additional reimbursement approval`,
          paragraphs: ["Spending was above the cash received. An independent approver must approve before the custodian pays it."], rows, cta }),
      });
    }
    if (actor === l.owner_id) {
      await notify({
        event: "audit.self_approval", entityType: "liquidations", entityId: id, email: false,
        recipients: await recipientsByRole(["admin", "accounting"], { exclude: [actor] }),
        subject: `${l.pcv_number}: liquidation self-approved by ${l.employee_name}`,
        content: () => ({ tone: "info", heading: `${l.employee_name} reviewed their own liquidation`,
          paragraphs: ["It is recorded in the audit log."], rows, cta }),
      });
    }
    return;
  }

  const heading = event === "liquidation.settled" ? "Cash settlement recorded" : "Additional reimbursement approved";
  const { data: links } = await db.from("fund_custodians").select("custodian_id").eq("fund_id", l.fund_id);
  // The employee wants to know; custodians need to know when an approved reimbursement is ready to pay.
  const include = event === "liquidation.reimbursement_approved"
    ? [l.owner_id, ...(links ?? []).map(row => row.custodian_id)] : [l.owner_id];
  await notify({
    event, entityType: "liquidations", entityId: id,
    recipients: await recipientsByRole([], { include, exclude: [actor] }),
    subject: `${l.pcv_number}: ${heading}`,
    content: () => ({ tone: "info", heading: `${l.pcv_number}: ${heading}`, paragraphs: [], rows, cta }),
  });
}
