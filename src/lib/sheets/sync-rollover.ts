import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { targetForBook } from "@/lib/grokbot/targets";
import type { WorkflowDatabase } from "@/lib/workflow";
import {
  dispatchGrokbot,
  grokbotCallbackToken,
  retryGrokbotOperation,
} from "@/lib/grokbot/delivery";

// The continuous ledger of the custodian's workbook receives a marker row after both approvals.
export async function syncSheetRollover(
  replenishmentId: string,
  retry = false,
) {
  const db = createAdminClient();
  const id = randomUUID();
  try {
    // Which bot serves this replenishment: the workbook enabled for its custodian and fund.
    const replenishment = await db.from("replenishments").select("fund_id, requested_by").eq("id", replenishmentId).single();
    if (replenishment.error || !replenishment.data.requested_by) throw new Error("Could not read the replenishment.");
    const workbook = await db.from("sheet_workbooks").select("id").eq("custodian_id", replenishment.data.requested_by)
      .eq("fund_id", replenishment.data.fund_id).eq("enabled", true).maybeSingle();
    const book = targetForBook(workbook.data?.id ?? "buying").book;
    const queued = await (db as unknown as SupabaseClient<WorkflowDatabase>).rpc("queue_grokbot_replenishment", {
      p_id: replenishmentId,
      p_operation: id,
      p_hash: createHash("sha256")
        .update(grokbotCallbackToken(id, book))
        .digest("hex"),
      p_book: book,
    });
    if (queued.error) throw new Error(queued.error.message);
    if (retry) await retryGrokbotOperation(queued.data);
    await dispatchGrokbot();
  } catch (error) {
    await db
      .from("sheet_rollovers")
      .update({
        error:
          error instanceof Error
            ? error.message
            : "Grokbot delivery is pending.",
      })
      .eq("replenishment_id", replenishmentId)
      .neq("status", "synced");
  }
}
