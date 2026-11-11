import "server-only";
import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { safeDbMessage } from "@/lib/db-error";
import {
  normalizeAccountingFilters,
  type AccountingParams,
  type AccountingFilters,
  type AccountingReport,
} from "@/lib/accounting";
import { todayInAppTz } from "@/lib/dates";
export async function loadAccountingFilters(params: AccountingParams) {
  const preliminary = normalizeAccountingFilters(params, null);
  if (preliminary.error || preliminary.filters.period !== "latest")
    return preliminary;
  const db = await createClient();
  let query = db
    .from("sheet_expenses")
    .select("expense_date")
    .lte("expense_date", todayInAppTz())
    .order("expense_date", { ascending: false, nullsFirst: false })
    .limit(1);
  if (preliminary.filters.book)
    query = query.eq("book_id", preliminary.filters.book);
  if (preliminary.filters.tab)
    query = query.eq("sheet_id", Number(preliminary.filters.tab));
  if (preliminary.filters.custodian) {
    let books = db.from("sheet_workbooks").select("id");
    books =
      preliminary.filters.custodian === "unassigned"
        ? books.is("custodian_id", null)
        : books.eq("custodian_id", preliminary.filters.custodian);
    const assigned = await books;
    if (assigned.error) throw new Error(safeDbMessage(assigned.error));
    query = query.in(
      "book_id",
      assigned.data.map((book) => book.id),
    );
  }
  const latest = await query;
  if (latest.error) throw new Error(safeDbMessage(latest.error));
  return normalizeAccountingFilters(
    params,
    latest.data[0]?.expense_date ?? null,
  );
}
export async function loadAccountingReport(
  filters: AccountingFilters,
  exportRows = false,
): Promise<AccountingReport> {
  const db = await createClient();
  const result = await db.rpc("accounting_dashboard", {
    p_filters: filters as unknown as Json,
    p_export: exportRows,
  });
  if (result.error) throw new Error(safeDbMessage(result.error));
  return result.data as unknown as AccountingReport;
}
