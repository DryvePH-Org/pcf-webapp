import "server-only";
import type { Json } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowDatabase } from "@/lib/workflow";
import { safeDbMessage } from "@/lib/db-error";
import {
  normalizeAccountingFilters,
  type AccountingParams,
  type AccountingFilters,
  type AccountingReport,
} from "@/lib/accounting";
export async function loadAccountingFilters(params: AccountingParams) {
  const preliminary = normalizeAccountingFilters(params, null);
  if (preliminary.error || preliminary.filters.period !== "latest")
    return preliminary;
  const db = (await createClient()) as unknown as SupabaseClient<WorkflowDatabase>;
  const filters = preliminary.filters;
  const latest = await db.rpc("accounting_latest_date", {
    p_source: filters.source,
    p_book: filters.book || null,
    p_tab: filters.tab ? Number(filters.tab) : null,
    p_custodian: filters.custodian || null,
  });
  if (latest.error) throw new Error(safeDbMessage(latest.error));
  return normalizeAccountingFilters(params, latest.data ?? null);
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
