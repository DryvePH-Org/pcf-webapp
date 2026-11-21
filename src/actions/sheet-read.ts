"use server";

import { revalidatePath } from "next/cache";

import { actionError, type ActionResult } from "@/lib/action-result";
import { getAdminUser } from "@/lib/auth";
import { isGrokbotBook } from "@/lib/grokbot/targets";
import { withinLimit } from "@/lib/rate-limit";
import { refreshWorkbook } from "@/lib/sheets/refresh";

// An administrator asks Grokbot to read the sheet now, for example after accounting corrected something by hand.
// The read is also done by itself after every approved liquidation; this is for the times in between.
export async function readSheetNow(book: string): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return actionError("Only administrators can ask for a read.");
  if (!isGrokbotBook(book)) return actionError("This workbook is not read by Grokbot.");
  if (!(await withinLimit(`sheet:read:${admin.id}`, 6, 60))) return actionError("Wait a minute before asking again.");
  try {
    await refreshWorkbook(book);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Could not ask Grokbot to read the sheet.");
  }
  revalidatePath("/accounting");
  return { ok: true };
}
