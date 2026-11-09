import "server-only";
import {
  sheetsAdmin,
  sheetsBridge,
  type Catalog,
  type ReadResult,
} from "./bridge";
import { summarizeLedger } from "./ledger-summary";
import { sheetExpenseTags } from "./planner";
import { parseExpenseRows } from "./parser";
import type { Cell, SheetExpense } from "./types";
import type { Json } from "@/lib/database.types";
export async function refreshWorkbook(book: string) {
  const db = sheetsAdmin();
  const claim = await db.rpc("claim_sheet_refresh", { p_id: book });
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data) return;
  try {
    const catalog = await sheetsBridge<Catalog>({ action: "catalog" });
    const entry = catalog.books.find((b) => b.key === book);
    if (!entry) throw new Error("Workbook missing from Google catalog.");
    const expenses: SheetExpense[] = [];
    const tabs = entry.tabs.filter(
      (tab) => /REPL[EI]NISHMENT/i.test(tab.title) || tab.title === "Sheet19",
    );
    // Bound concurrent reads while keeping large workbooks within the refresh lease.
    for (let offset = 0; offset < tabs.length; offset += 2) {
      await Promise.all(
        tabs.slice(offset, offset + 2).map(async (tab) => {
          const rows: Cell[][] = [];
          let cursor: number | null = 0;
          while (cursor !== null) {
            const response: ReadResult = await sheetsBridge<ReadResult>({
              action: "read",
              book,
              sheetId: tab.sheetId,
              startRow: cursor,
              limit: 500,
            });
            for (const sheet of response.snapshot.data.sheets ?? [])
              for (const block of sheet.data ?? [])
                for (const [offset, row] of (block.rowData ?? []).entries())
                  rows[(block.startRow ?? cursor) + offset] = row.values ?? [];
            const next: number | null = response.snapshot.nextRow;
            if (next !== null && next <= cursor)
              throw new Error("Invalid Google pagination.");
            cursor = next;
          }
          tab.ledger = summarizeLedger(
            Array.from({ length: rows.length }, (_, i) => rows[i] ?? []),
          );
          tab.expenseTags = sheetExpenseTags(
            Array.from({ length: rows.length }, (_, i) => rows[i] ?? []),
          );
          expenses.push(
            ...parseExpenseRows(
              book,
              tab.sheetId,
              tab.title,
              Array.from({ length: rows.length }, (_, i) => rows[i] ?? []),
            ),
          );
        }),
      );
    }
    const saved = await db.rpc("replace_sheet_mirror", {
      p_id: book,
      p_rows: expenses as unknown as Json,
      p_catalog: entry.tabs as unknown as Json,
      p_token: claim.data,
    });
    if (saved.error) throw new Error(saved.error.message);
  } catch (error) {
    await db
      .from("sheet_workbooks")
      .update({
        refresh_until: null,
        sync_error:
          error instanceof Error
            ? error.message.slice(0, 250)
            : "Refresh failed.",
      })
      .eq("id", book)
      .eq("refresh_token", claim.data);
    throw error;
  }
}
