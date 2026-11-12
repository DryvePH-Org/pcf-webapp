"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queueNotification } from "@/lib/notifications/deliver";
import { notifyBudgetRequest } from "@/lib/notifications/requests";
import { getCurrentUser } from "@/lib/auth";
import { safeDbMessage } from "@/lib/db-error";
import { toMoneyNumber } from "@/lib/money";
import { canPerform } from "@/lib/permissions";
import { REPEAT_MESSAGE, isRepeat, withinLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createBudgetRequestSchema, reviewBudgetRequestSchema, type CreateBudgetRequestValues } from "@/lib/validators/budget-request";
import type { ActionResult } from "@/lib/action-result";

function refresh(id?: string) {
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/requests/${id}`);
}

export async function createBudgetRequest(input: CreateBudgetRequestValues): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to request a budget." };
  const parsed = createBudgetRequestSchema.safeParse({ ...input, requester_name: user.full_name });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (!(await withinLimit(`request:create:${user.id}`, 20, 60))) return { ok: false, error: "Too many requests. Wait a minute and try again." };
  // A double-click or a slow connection must not create the same request twice.
  if (await isRepeat(user.id, "request:create", parsed.data)) return { ok: false, error: REPEAT_MESSAGE };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_budget_request", {
    p_fund_id: parsed.data.fund_id, p_name: user.full_name,
    p_amount: toMoneyNumber(parsed.data.amount), p_purpose: parsed.data.purpose,
  });
  if (error) return { ok: false, error: safeDbMessage(error) };
  queueNotification("budget.submitted", () => notifyBudgetRequest(data, "budget.submitted", user.id));
  refresh();
  return { ok: true, id: data };
}

export async function reviewBudgetRequest(input: z.input<typeof reviewBudgetRequestSchema>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !canPerform(user.role, "request.review")) return { ok: false, error: "Only a custodian, the fund approver or an administrator can review requests." };
  const parsed = reviewBudgetRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the review." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_budget_request", { p_id: parsed.data.id, p_approve: parsed.data.approve, p_note: parsed.data.note });
  if (error) return { ok: false, error: safeDbMessage(error) };
  queueNotification("budget.reviewed", () => notifyBudgetRequest(parsed.data.id, "budget.reviewed", user.id));
  refresh(parsed.data.id);
  return { ok: true };
}

export async function cancelBudgetRequest(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to cancel a request." };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Request not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_budget_request", { p_id: id });
  if (error) return { ok: false, error: safeDbMessage(error) };
  queueNotification("budget.cancelled", () => notifyBudgetRequest(id, "budget.cancelled", user.id));
  refresh(id);
  return { ok: true };
}
