import "server-only";
import { sheetsAdmin } from "./database";
import { queueGrokbotOperation, dispatchGrokbot } from "@/lib/grokbot/delivery";
import { isGrokbotBook, targetEnvelope, targetForBook } from "@/lib/grokbot/targets";

export async function refreshWorkbook(book: string) {
  if (!isGrokbotBook(book))
    throw new Error("Grokbot refresh is not configured for this workbook.");
  const target = targetForBook(book);
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
