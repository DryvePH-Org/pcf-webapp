import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sheetsAdmin } from "./database";
import { queueGrokbotOperation, dispatchGrokbot } from "@/lib/grokbot/delivery";
import { isGrokbotBook, targetEnvelope, targetForBook } from "@/lib/grokbot/targets";

// `onlyWhenIdle`: the automatic read after a finished job waits while more writes for the same sheet are queued, so the
// bot is not asked to read a sheet that is about to change again. The read happens after the last of them.
export async function refreshWorkbook(book: string, options: { onlyWhenIdle?: boolean } = {}) {
  if (!isGrokbotBook(book))
    throw new Error("Grokbot refresh is not configured for this workbook.");
  const target = targetForBook(book);
  if (options.onlyWhenIdle) {
    const waiting = await createAdminClient()
      .from("grokbot_operations")
      .select("id", { count: "exact", head: true })
      .eq("spreadsheet_id", target.spreadsheet_id)
      .in("kind", ["liquidation_approved", "replenishment_approved"])
      .in("status", ["queued", "running"]);
    if (!waiting.error && (waiting.count ?? 0) > 0) return;
  }
  const db = sheetsAdmin();
  const claim = await db.rpc("claim_sheet_refresh", { p_id: book });
  if (claim.error) throw new Error("Could not claim workbook refresh.");
  if (!claim.data) return;
  try {
    await queueGrokbotOperation({
      kind: "workbook_refresh",
      book: target.book,
      payload: {
        event: "pcf.workbook.refresh",
        book_id: book,
        refresh_token: claim.data,
        target: targetEnvelope(target),
        sheet_mutations_allowed: false,
        task: "Read the complete ledger tab into the A1-based snapshot.grid schema supplied in the webhook instructions. Include all ledger and signoff rows and the expense-type summary formulas. Return spreadsheet_id, sheet_id, verified:true, checks.write_scope:true and snapshot. No sheet mutations, including audit rows.",
      },
    });
    await dispatchGrokbot();
  } catch (error) {
    await db
      .from("sheet_workbooks")
      .update({
        refresh_until: null,
        sync_error: error instanceof Error ? error.message : "Refresh failed.",
      })
      .eq("id", book)
      .eq("refresh_token", claim.data);
    throw error;
  }
}
