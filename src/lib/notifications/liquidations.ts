import { createAdminClient } from "@/lib/supabase/admin";
import { formatPHP } from "@/lib/money";
import { LIQUIDATION_LABELS } from "@/lib/liquidation";
import { notify, recipientsByRole } from "./deliver";
import { reviewersFor } from "./routing";
import { tellPerson } from "@/lib/telegram/notify";

export type LiquidationEvent = "liquidation.submitted" | "liquidation.filed_for_you" | "liquidation.reviewed" | "liquidation.settled" | "liquidation.reimbursement_approved";

export async function notifyLiquidation(id: string, event: LiquidationEvent, actor: string) {
  const db = createAdminClient();
  const { data: row, error } = await db.from("liquidations").select("*").eq("id", id).single();
  if (error) throw error;
  // who filed it for the employee, when it was not the employee (the column is newer than the generated types)
  const l = row as typeof row & { filed_by?: string | null; filed_by_name?: string | null };
  const filedForEmployee = Boolean(l.filed_by) && l.filed_by !== l.owner_id;
  const { data: fund } = await db.from("funds").select("approval_threshold, per_txn_limit").eq("id", l.fund_id).single();
  const rows = [
    { label: "Employee", value: l.employee_name }, { label: "Advance", value: formatPHP(l.amount_received) },
    { label: "Spent", value: formatPHP(l.total_spent) },
  ];
  const cta = { label: "Open liquidation", path: `/liquidations/${id}` };
  const needsApprover = event === "liquidation.reviewed" && l.status === "approved"
    && l.total_spent > l.amount_received && (l.total_spent >= (fund?.approval_threshold ?? 0) || l.total_spent > (fund?.per_txn_limit ?? Infinity));

  // The employee is told when a custodian filed the liquidation for them, so they can say if something is wrong.
  if (event === "liquidation.filed_for_you") {
    if (!filedForEmployee || actor !== l.filed_by) return;
    const filer = l.filed_by_name ?? "Ang custodian";
    await notify({
      event, entityType: "liquidations", entityId: id,
      recipients: await recipientsByRole([], { include: [l.owner_id], exclude: [] }),
      subject: `${l.pcv_number}: ${filer} filed your liquidation`,
      content: () => ({ tone: "info", heading: `${filer} filed your liquidation`,
        paragraphs: [`${filer} filed the liquidation of ${l.pcv_number} for you (spent ${formatPHP(l.total_spent)}). If something is wrong, tell them before it is reviewed.`], rows, cta }),
    });
    await tellPerson(l.owner_id, `📋 <b>May nag-file ng liquidation para sa iyo.</b>\n\n${l.pcv_number} · ginastos ${formatPHP(l.total_spent)}\nSi ${(l.filed_by_name ?? "custodian").replace(/&/g, "&amp;").replace(/</g, "&lt;")} ang nag-file.\n\nKung may mali, sabihin agad sa kanya bago ito ma-review.`);
    return;
  }

  if (event === "liquidation.submitted") {
    // Reviewers follow the fund's rules, the same ones the database enforces.
    const reviewers = await reviewersFor(l.fund_id, l.owner_id);
    await notify({
      event, entityType: "liquidations", entityId: id,
      recipients: await recipientsByRole(reviewers.fallbackToAdmin ? ["admin"] : [], { include: reviewers.ids, exclude: [actor] }),
      subject: `${l.pcv_number}: liquidation needs your review`,
      content: () => ({ tone: "action", heading: `${l.pcv_number} liquidation needs your review`,
        paragraphs: [filedForEmployee ? `${l.filed_by_name ?? "A custodian"} filed the liquidation for ${l.employee_name}.` : `${l.employee_name} submitted their liquidation.`], rows, cta }),
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
          paragraphs: ["Spending was above the cash received. An approver must approve before the custodian pays it."], rows, cta }),
      });
    }
    // A custodian who filed the liquidation for the employee and then reviewed it herself is allowed, and always visible.
    if (filedForEmployee && actor === l.filed_by) {
      await notify({
        event: "audit.self_approval", entityType: "liquidations", entityId: id, email: false,
        recipients: await recipientsByRole(["admin", "accounting"], { exclude: [actor] }),
        subject: `${l.pcv_number}: filed and reviewed by ${l.filed_by_name ?? "the same custodian"}`,
        content: () => ({ tone: "info", heading: `${l.filed_by_name ?? "A custodian"} filed and reviewed the liquidation for ${l.employee_name}`,
          paragraphs: ["The custodian who filed it also reviewed it. It is recorded in the audit log."], rows, cta }),
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
