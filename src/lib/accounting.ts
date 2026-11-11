import { z } from "zod";
import { todayInAppTz } from "@/lib/dates";
import type { SheetExpense } from "@/lib/sheets/types";
export type AccountingParams = Record<string, string | undefined>;
export type AccountingFilters = {
  book: string;
  custodian: string;
  period: string;
  month: string;
  from: string;
  to: string;
  q: string;
  tab: string;
  person: string;
  supplier: string;
  plate: string;
  tin: string;
  category: string;
  company: string;
  classification: string;
  receipt: string;
  date_status: string;
  repeats: boolean;
  page: number;
};
export type AccountingRow = SheetExpense & {
  tin: string;
  address: string;
  workbook_name: string;
  custodian_id: string | null;
  custodian_name: string | null;
  spreadsheet_id: string;
  copy_rank: number;
};
export type AccountingReport = {
  totals: {
    expense_count: number;
    amount: number;
    vouchers: number;
    suppliers: number;
    missing_receipt_numbers: number;
    ce_amount: number;
    nce_amount: number;
    missing_tags: number;
  };
  rows: AccountingRow[];
  by_workbook: { book_id: string; count: number; amount: number }[];
  by_category: { label: string; count: number; amount: number }[];
  by_month: { month: string; count: number; amount: number }[];
  hidden_copies: number;
  undated_scope: number;
  latest_date: string | null;
  categories: string[];
  companies: string[];
};
const fields = [
  "q",
  "person",
  "supplier",
  "plate",
  "tin",
  "category",
  "company",
] as const;
export function normalizeAccountingFilters(
  params: AccountingParams,
  latestDate: string | null,
  today = todayInAppTz(),
): { filters: AccountingFilters; error: string | null } {
  let error: string | null = null;
  const period =
    params.period ??
    (params.history === "all"
      ? "all"
      : params.from || params.to
        ? "custom"
        : params.month
          ? "month"
          : "all");
  const filters: AccountingFilters = {
    book: params.book ?? "",
    custodian: params.custodian ?? "",
    period,
    month: params.month ?? (latestDate ?? today).slice(0, 7),
    from: "",
    to: "",
    q: "",
    tab: params.book ? (params.tab ?? "") : "",
    person: "",
    supplier: "",
    plate: "",
    tin: "",
    category: "",
    company: "",
    classification: params.classification ?? "",
    receipt: params.receipt ?? "",
    date_status: params.date_status ?? "",
    repeats: params.repeats === "1",
    page: /^\d+$/.test(params.page ?? "")
      ? Math.max(1, Math.min(10000, Number(params.page)))
      : 1,
  };
  for (const field of fields)
    filters[field] = (params[field] ?? "")
      .trim()
      .slice(0, field === "q" ? 150 : 300);
  if (
    filters.book &&
    !["operations", "buying", "selling", "lmr", "dryve"].includes(filters.book)
  )
    error = "Choose an available workbook.";
  if (
    filters.custodian &&
    filters.custodian !== "unassigned" &&
    !z.uuid().safeParse(filters.custodian).success
  )
    error = "Choose an available custodian.";
  if (filters.tab && !/^\d+$/.test(filters.tab))
    error = "Choose a valid worksheet.";
  if (!["", "CE", "NCE", "other"].includes(filters.classification))
    error = "Choose a valid classification.";
  if (!["", "missing", "present"].includes(filters.receipt))
    error = "Choose a valid receipt-number filter.";
  if (!["", "missing"].includes(filters.date_status))
    error = "Choose a valid date filter.";
  if (filters.date_status === "missing") filters.period = "all";
  if (["latest", "current", "month"].includes(filters.period)) {
    if (filters.period === "current") filters.month = today.slice(0, 7);
    if (filters.period === "latest")
      filters.month = (latestDate ?? today).slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.month))
      error = "Choose a valid month.";
    else {
      const [year, month] = filters.month.split("-").map(Number);
      filters.from = filters.month + "-01";
      filters.to = new Date(Date.UTC(year, month, 0))
        .toISOString()
        .slice(0, 10);
    }
  } else if (filters.period === "custom") {
    filters.from = params.from ?? "";
    filters.to = params.to ?? "";
    if (!filters.from && !filters.to)
      error = "Choose a start or end date for the custom range.";
    if (
      (filters.from && !z.iso.date().safeParse(filters.from).success) ||
      (filters.to && !z.iso.date().safeParse(filters.to).success)
    )
      error = "Enter valid dates.";
    if (filters.from && filters.to && filters.from > filters.to)
      error = "The start date must be before the end date.";
  } else if (filters.period !== "all") error = "Choose a valid period.";
  return { filters, error };
}
export function accountingUrl(
  filters: AccountingFilters,
  changes: Partial<AccountingFilters> = {},
  path = "/accounting",
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...changes })) {
    if (key === "from" || key === "to") {
      if ((changes.period ?? filters.period) !== "custom") continue;
    }
    if (value !== "" && value !== false && !(key === "page" && value === 1))
      params.set(key, value === true ? "1" : String(value));
  }
  return `${path}?${params}`;
}
