import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  dispatchGrokbot,
  grokbotCallbackToken,
  retryGrokbotOperation,
} from "@/lib/grokbot/delivery";

// The continuous Buying ledger receives a green marker after both approvals.
export async function syncSheetRollover(
  replenishmentId: string,
  retry = false,
) {
  const db = createAdminClient();
  const id = randomUUID();
  try {
    const queued = await db.rpc("queue_grokbot_replenishment", {
      p_id: replenishmentId,
      p_operation: id,
      p_hash: createHash("sha256")
        .update(grokbotCallbackToken(id))
        .digest("hex"),
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
