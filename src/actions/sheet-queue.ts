"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { dispatchGrokbot, retryGrokbotOperation } from "@/lib/grokbot/delivery";
import { isStuck } from "@/lib/grokbot/recovery";
import { withinLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

// Send a stopped job to the bot again. An administrator may retry any; a custodian only for a fund they are assigned to.
export async function retrySheetJob(operationId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !["admin", "custodian"].includes(user.role)) return actionError("Only a custodian or an administrator can retry a sheet update.");
  if (!z.uuid().safeParse(operationId).success) return actionError("That job was not found.");
  if (!(await withinLimit(`sheet-queue:retry:${user.id}`, 10, 60))) return actionError("Wait a minute before trying again.");
  const db = createAdminClient();
  const op = await db.from("grokbot_operations").select("id, kind, status, runner_id, updated_at, liquidation_id, replenishment_id").eq("id", operationId).maybeSingle();
  if (op.error || !op.data || !["liquidation_approved", "replenishment_approved"].includes(op.data.kind)) return actionError("That job was not found.");
  if (!["failed", "blocked"].includes(op.data.status) && !isStuck(op.data)) return actionError("Only a job that needs attention can be retried.");
  let fundId: string | undefined;
  if (op.data.liquidation_id) fundId = (await db.from("liquidations").select("fund_id").eq("id", op.data.liquidation_id).maybeSingle()).data?.fund_id;
  else if (op.data.replenishment_id) fundId = (await db.from("replenishments").select("fund_id").eq("id", op.data.replenishment_id).maybeSingle()).data?.fund_id;
  if (!fundId) return actionError("That job was not found.");
  if (user.role === "custodian") {
    const mine = await db.from("fund_custodians").select("fund_id").eq("fund_id", fundId).eq("custodian_id", user.id).maybeSingle();
    if (!mine.data) return actionError("This fund is not assigned to you.");
  }
  try {
    await retryGrokbotOperation(operationId);
  } catch {
    return actionError("Could not queue the job again. Try again in a moment.");
  }
  // it is in the queue now; if the bot cannot be reached this moment the dispatcher picks it up later
  await dispatchGrokbot().catch(() => undefined);
  revalidatePath("/sheet-queue");
  return { ok: true };
}
