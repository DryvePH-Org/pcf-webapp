import { expect, it } from "vitest";
import { normalizeAccountingFilters, accountingUrl } from "@/lib/accounting";
import { summarizeLedger } from "@/lib/sheets/ledger-summary";
import { validateReceiptExtraction } from "@/lib/receipt-extraction";
import type { Cell } from "@/lib/sheets/types";
const s = (value: string): Cell => ({
  userEnteredValue: { stringValue: value },
});
const n = (value: number): Cell => ({ effectiveValue: { numberValue: value } });
it("scopes latest month, leap months, custom ranges and missing dates", () => {
  expect(normalizeAccountingFilters({}, "2026-10-02").filters).toMatchObject({
    from: "2026-10-01",
    to: "2026-10-31",
  });
  expect(
    normalizeAccountingFilters({ period: "month", month: "2024-02" }, null)
      .filters.to,
  ).toBe("2024-02-29");
  expect(
    normalizeAccountingFilters(
      { period: "custom", from: "2026-11-10", to: "2026-11-01" },
      null,
    ).error,
  ).toBeTruthy();
  expect(
    normalizeAccountingFilters({ date_status: "missing" }, null).filters,
  ).toMatchObject({ period: "all", from: "", to: "" });
  const filters = normalizeAccountingFilters(
    { q: "100% & fuel", book: "buying" },
    null,
  ).filters;
  expect(
    new URL(accountingUrl(filters), "https://example.invalid").searchParams.get(
      "q",
    ),
  ).toBe("100% & fuel");
});
it("keeps physical cash separate and exposes a broken cash formula", () => {
  const grid: Cell[][] = [
    ["DATE", "OUT", "IN", "BALANCE"].map(s),
    [s("Opening"), {}, n(100), n(100)],
    [s("2026-11-01"), n(20), {}, n(80)],
    [s("TOTAL DISBURSEMENTS"), n(20)],
    [s("CASH ON HAND"), s("#REF!"), n(999)],
    [s("UNLIQUIDATED"), n(10)],
  ];
  expect(summarizeLedger(grid)).toMatchObject({
    ledger_balance: 80,
    cash_on_hand: null,
    unliquidated: 10,
    formula_errors: 1,
    balanced: true,
    outflows: 20,
  });
  grid[2][3] = s("#REF!");
  expect(summarizeLedger(grid)?.ledger_balance).toBeNull();
});
const extraction = () => ({
  supplier: "Seller",
  tin: "",
  tag: "UNKNOWN",
  expense_date: "2026-11-09",
  plate: "",
  receipt_number: "000123",
  amount: "PHP 1,120.00",
  warnings: [],
  tax_status: "unknown",
  tax_status_evidence: "",
  confidence: {
    supplier: "high",
    tin: "high",
    tag: "high",
    expense_date: "high",
    plate: "high",
    receipt_number: "high",
    amount: "high",
  },
});
it("validates uncertainty and never infers NON VAT from a missing TIN", () => {
  const value = extraction();
  expect(validateReceiptExtraction(value, []).suggestion).toMatchObject({
    tin: "",
    amount: "1120.00",
    receipt_number: "000123",
    tag: "",
  });
  value.confidence.supplier = "low";
  expect(validateReceiptExtraction(value, []).suggestion.supplier).toBe("");
  value.tax_status = "non_vat";
  value.tax_status_evidence = "NON-VAT";
  expect(validateReceiptExtraction(value, []).suggestion.tin).toBe("NON VAT");
});
