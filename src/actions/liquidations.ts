"use server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { safeDbMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { toMoneyNumber } from "@/lib/money";
import { withinLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/action-result";
import { saveLiquidationSchema, submitLiquidationSchema, liquidationReviewSchema, settlementSchema, type LiquidationFormValues } from "@/lib/validators/liquidation";
import { queueNotification } from "@/lib/notifications/deliver";
import { notifyLiquidation } from "@/lib/notifications/liquidations";
import type { WorkflowDatabase } from "@/lib/workflow";

function refresh() {
  for (const path of ["/liquidations", "/vouchers", "/requests", "/replenishments"]) revalidatePath(path, "layout");
  revalidatePath("/dashboard");
}
export async function createLiquidation(voucherId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!z.uuid().safeParse(voucherId).success) return { ok: false, error: "Voucher not found." };
  if (!(await withinLimit(`liquidation:create:${user.id}`, 20, 60))) return { ok: false, error: "Too many attempts. Wait a minute." };
  const db = await createClient();
  const { data, error } = await db.rpc("create_liquidation", { p_voucher_id: voucherId });
  if (error) return { ok: false, error: safeDbMessage(error) };
  refresh(); return { ok: true, id: data };
}
// A custodian (or administrator) starts the liquidation for an employee who cannot use the website. It stays the
// employee's liquidation; the database records who filed it for them and never lets that person review it.
export async function createLiquidationFor(voucherId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || !["custodian", "admin"].includes(user.role)) return { ok: false, error: "Only a custodian of the fund or an administrator can file for someone else." };
  if (!z.uuid().safeParse(voucherId).success) return { ok: false, error: "Voucher not found." };
  if (!(await withinLimit(`liquidation:create-for:${user.id}`, 20, 60))) return { ok: false, error: "Too many attempts. Wait a minute." };
  const db = (await createClient()) as unknown as SupabaseClient<WorkflowDatabase>;
  const { data, error } = await db.rpc("create_liquidation_for", { p_voucher_id: voucherId });
  if (error) return { ok: false, error: safeDbMessage(error) };
  refresh(); return { ok: true, id: data };
}
// `quiet` is the automatic save while someone types: it stores the draft and leaves every page as it is (no refresh).
export async function saveLiquidation(input: LiquidationFormValues, submit: boolean, quiet = false): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const parsed = (submit ? submitLiquidationSchema : saveLiquidationSchema).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;
  const db = await createClient();
  const { error } = await db.rpc("save_liquidation", { p_id: v.id, p_department: v.department, p_filing_date: v.filing_date, p_unspent_reason: v.unspent_reason,
    p_items: v.items.map(({ extra_photos, ...item }) => { void extra_photos; return { ...item, amount: toMoneyNumber(item.amount) }; }) });
  if (error) return { ok: false, error: safeDbMessage(error) };
  // the extra pictures of each line (the main one travels with the line itself)
  const more = await (db as unknown as SupabaseClient<WorkflowDatabase>).rpc("set_liquidation_photos", {
    p_id: v.id,
    p_photos: v.items.flatMap(item => item.extra_photos.filter(path => path !== item.receipt_path).map(path => ({ item_id: item.id, path }))),
  });
  if (more.error) return { ok: false, error: `Draft saved, but the extra pictures were not. ${safeDbMessage(more.error)}` };
  if (submit) {
    const sent = await db.rpc("submit_liquidation", { p_id: v.id });
    if (sent.error) { refresh(); return { ok: false, error: `Draft saved. ${safeDbMessage(sent.error)}` }; }
    queueNotification("liquidation.submitted", () => notifyLiquidation(v.id, "liquidation.submitted", user.id));
    // When someone filed it for the employee, the employee is told (it is a no-op for the employee's own filing).
    queueNotification("liquidation.filed_for_you", () => notifyLiquidation(v.id, "liquidation.filed_for_you", user.id));
  }
  if (!quiet || submit) refresh();
  return { ok: true };
}
export async function reviewLiquidation(input: z.input<typeof liquidationReviewSchema>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !["custodian", "approver", "admin"].includes(user.role)) return { ok: false, error: "Only custodians, the fund approver and administrators can review liquidation." };
  const parsed = liquidationReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your review." };
  const db = await createClient();
  const { error } = await db.rpc("review_liquidation", { p_id: parsed.data.id, p_approve: parsed.data.approve, p_note: parsed.data.note });
  if (error) return { ok: false, error: safeDbMessage(error) };
  queueNotification("liquidation.reviewed", () => notifyLiquidation(parsed.data.id, "liquidation.reviewed", user.id));
  refresh(); return { ok: true };
}
// Approving a liquidation of a database-only fund: the same review as for a sheet fund, with no sheet update.
export async function approveLiquidationWithoutSheet(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !["custodian", "approver", "admin"].includes(user.role)) return { ok: false, error: "Only custodians, the fund approver and administrators can approve a liquidation." };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Liquidation not found." };
  if (!(await withinLimit(`liquidation:approve:${user.id}`, 20, 60))) return { ok: false, error: "Too many attempts. Wait a minute." };
  const db = (await createClient()) as unknown as SupabaseClient<WorkflowDatabase>;
  const { error } = await db.rpc("approve_liquidation_without_sheet", { p_id: id });
  if (error) return { ok: false, error: safeDbMessage(error) };
  queueNotification("liquidation.reviewed", () => notifyLiquidation(id, "liquidation.reviewed", user.id));
  refresh(); return { ok: true };
}
export async function approveLiquidationReimbursement(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !["approver", "admin"].includes(user.role)) return { ok: false, error: "Only an approver or an administrator can approve this reimbursement." };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Liquidation not found." };
  const db = await createClient();
  const { error } = await db.rpc("approve_liquidation_reimbursement", { p_id: id });
  if (error) return { ok: false, error: safeDbMessage(error) };
  queueNotification("liquidation.reimbursement_approved", () => notifyLiquidation(id, "liquidation.reimbursement_approved", user.id));
  refresh(); return { ok: true };
}
export async function recordLiquidationSettlement(input: z.input<typeof settlementSchema>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !["custodian", "approver", "admin"].includes(user.role)) return { ok: false, error: "Only custodians, the fund approver and administrators can record cash settlement." };
  const parsed = settlementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the settlement." };
  const db = await createClient();
  const { error } = await db.rpc("record_liquidation_settlement", { p_id: parsed.data.id, p_amount: toMoneyNumber(parsed.data.amount), p_note: parsed.data.note });
  if (error) return { ok: false, error: safeDbMessage(error) };
  queueNotification("liquidation.settled", () => notifyLiquidation(parsed.data.id, "liquidation.settled", user.id));
  refresh(); return { ok: true };
}
