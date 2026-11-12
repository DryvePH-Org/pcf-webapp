import { describe, expect, it } from "vitest";

import { grokbotFinancialEvent } from "@/lib/grokbot/contract";
import { latestReplenishmentNumber, sheetExpenseTags } from "@/lib/sheets/grid";
import { summarizeLedger } from "@/lib/sheets/ledger-summary";
import { parseExpenseRows } from "@/lib/sheets/parser";
import { snapshotSchemaFor, validateFinancialResult } from "@/lib/grokbot/results";
import { GROKBOT_TARGETS, targetForSpreadsheet } from "@/lib/grokbot/targets";
import type { Cell } from "@/lib/sheets/types";

// A synthetic copy of the DRYVE layout (same columns, rows and formulas as the real tab; made-up amounts).
const TYPES = [
  "PARTS EXPENSE", "REPAIRS AND MAINTENANCE", "DETAILING EXPENSE", "FUEL AND OIL", "PARKING AND TOLL", "COMMUNICATION",
  "ALLOWANCE", "TRANSPORTATION", "DELIVERY/COURIER", "FACILITATION (SOP)", "COMMISSION", "OTHER SALARIES/BONUSES",
  "CASH ADVANCE", "NOTARIAL", "TRANSFER", "MEALS", "SUPPLIES: CLEANING", "SUPPLIES: DRINKING WATER",
  "BANK FEE/GCASH CHARGES", "OTHER EXPENSES", "MEDICAL EXPENSES", "HOTEL & ACCOMODATION", "ADMIN AND OFFICE SUPPLIES",
  "HUMAN RESOURCE EXPENSE", "REPRESENTATION", "MARKETING", "GADGET", "OFFICE EQUIPMENT", "LICENSES AND PERMIT", "SUBSCRIPTION EXPENSE",
];
const text = (value: string): Cell => ({ userEnteredValue: { stringValue: value }, effectiveValue: { stringValue: value }, formattedValue: value });
const num = (value: number, formula?: string): Cell => ({
  userEnteredValue: formula ? { formulaValue: formula } : { numberValue: value },
  effectiveValue: { numberValue: value },
  formattedValue: String(value),
});
const serial = (iso: string) => (Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86400000;

function dryveGrid(): Cell[][] {
  const grid: Cell[][] = Array.from({ length: 112 }, () => Array.from({ length: 17 }, () => ({}) as Cell));
  const set = (ref: string, cell: Cell) => {
    const col = ref.charCodeAt(0) - 65;
    grid[Number(ref.slice(1)) - 1][col] = cell;
  };
  ["NO", "DATE", "COMPANY", "EXPENSE TYPE", "PCF VOUCHER #", "PARTICULARS", "PLATE#", "POINT PERSON", "PAYEE/COMPANY", "IN", "OUT", "BALANCE"]
    .forEach((header, index) => set(`${String.fromCharCode(65 + index)}4`, text(header)));
  set("B1", text("DRYVE MARKETING CORP."));
  set("B5", text("BALANCE FORWARDED"));
  set("L5", num(5000, "='REPLENISHMENT#12 - NOVEMBER 202'!L61"));
  set("B6", text("REPLENISHMENT #13"));
  set("J6", num(38000, "='REPLENISHMENT#12 - NOVEMBER 202'!K62"));
  set("L6", num(43000, "=L5+J6-K6"));
  set("B7", text("ADDITIONAL FUND"));
  set("J7", num(6000));
  set("L7", num(49000, "=L6+J7-K7"));
  // Row 8: an expense. Row 9: a new replenishment marker. Row 10: another expense.
  set("A8", num(1));
  set("B8", num(serial("2026-11-12")));
  set("C8", text("DRYVE")); set("D8", text("MEALS")); set("E8", num(1728)); set("F8", text("TEAM LUNCH"));
  set("G8", text("N/A")); set("H8", text("JUSTINE")); set("I8", text("JOLLIBEE")); set("K8", num(250)); set("L8", num(48750, "=L7+J8-K8"));
  set("B9", text("REPLENISHMENT #14")); set("J9", num(1000)); set("L9", num(49750, "=L8+J9-K9"));
  set("A10", num(2));
  set("B10", num(serial("2026-11-13")));
  set("C10", text("VENTA")); set("D10", text("FUEL AND OIL")); set("E10", num(1729)); set("F10", text("GAS FOR DELIVERY"));
  set("G10", text("ABC 123")); set("H10", text("MARIEL")); set("I10", text("SHELL")); set("K10", num(100)); set("L10", num(49650, "=L9+J10-K10"));
  for (let row = 11; row <= 62; row++) set(`L${row}`, num(49650, `=L${row - 1}+J${row}-K${row}`));
  set("K63", num(350, "=SUM(K6:K62)"));
  set("J65", text("TOTAL DISBURSEMENT")); set("L65", num(350, "=K63"));
  set("J70", text("TOTAL")); set("L70", num(350, "=SUM(L65:L69)"));
  set("D71", text("PREPARED BY:")); set("J71", text("CASH ON HAND")); set("L71", num(49650, "=P5"));
  set("N5", num(50000, "=SUM(L5,J6:J58)")); set("O5", num(350, "=SUM(K8:K62)")); set("P5", num(49650, "=N5-O5"));
  set("N9", text("SUMMARY OF ACCOUNTS")); set("B82", text("SUMMARY OF ACCOUNTS"));
  TYPES.forEach((type, index) => {
    set(`N${10 + index}`, text(type));
    set(`Q${10 + index}`, num(0, `=SUMIF($D$8:$D$62,"${type}",$K$8:$K$62)`));
    set(`B${83 + index}`, text(type));
    set(`E${83 + index}`, num(0, `=SUMIF($D$8:$D$62,"${type}",$K$8:$K$62)`));
  });
  return grid;
}

describe("the DRYVE sheet layout", () => {
  const grid = dryveGrid();

  it("finds the ledger, its balance and the cash on hand", () => {
    const summary = summarizeLedger(grid)!;
    expect(summary.opening_balance).toBe(5000);
    expect(summary.inflows).toBe(45000);
    expect(summary.outflows).toBe(350);
    expect(summary.expense_rows).toBe(2);
    expect(summary.ledger_balance).toBe(49650);
    expect(summary.cash_on_hand).toBe(49650);
    expect(summary.balanced).toBe(true);
    expect(summary.formula_errors).toBe(0);
  });

  it("reads the 30 expense types once, from the summary of accounts", () => {
    const tags = sheetExpenseTags(grid);
    expect(tags).toHaveLength(30);
    expect(tags).toContain("FACILITATION (SOP)");
    expect(tags).toContain("HOTEL & ACCOMODATION");
  });

  it("reads the highest replenishment marker, including the funding row", () => {
    expect(latestReplenishmentNumber(grid)).toBe(14);
    const withoutMarker = dryveGrid();
    withoutMarker[8][1] = {};
    expect(latestReplenishmentNumber(withoutMarker)).toBe(13);
  });

  it("reads expense rows with the right columns and skips markers and funding rows", () => {
    const expenses = parseExpenseRows("dryve", 1251133408, "DRYVE PCF - NOV TO DEC 2026", grid);
    expect(expenses).toHaveLength(2);
    expect(expenses[0]).toMatchObject({
      source_row: 8, expense_date: "2026-11-12", amount: 250, particulars: "TEAM LUNCH", category: "MEALS",
      voucher: "1728", person: "JUSTINE", supplier: "JOLLIBEE", plate: "N/A", company: "DRYVE",
    });
    expect(expenses[1]).toMatchObject({ source_row: 10, category: "FUEL AND OIL", company: "VENTA", supplier: "SHELL", plate: "ABC 123" });
  });

  it("accepts a snapshot of the DRYVE tab and only that tab", () => {
    const schema = snapshotSchemaFor(GROKBOT_TARGETS.dryve);
    const { spreadsheet_id, sheet_id, sheet_title } = GROKBOT_TARGETS.dryve;
    expect(schema.safeParse({ spreadsheet_id, sheet_id, sheet_title, grid: dryveGrid() }).success).toBe(true);
    expect(schema.safeParse({ ...GROKBOT_TARGETS.buying, grid: dryveGrid() }).success).toBe(false);
  });
});

describe("DRYVE events and results", () => {
  const id = "91000000-0000-4000-8000-000000000001";
  const { spreadsheet_id, sheet_id, sheet_title } = GROKBOT_TARGETS.dryve;
  const line = { entry_id: id, particulars: "Lunch", amount: "250.00", tag: "MEALS", expense_date: "2026-11-12", supplier: "JOLLIBEE", tin: "", receipt_number: "", plate: "N/A", company: "DRYVE" };
  const event = {
    protocol_version: "pcf.grokbot.v1", operation_id: id, target: { spreadsheet_id, sheet_id, sheet_title },
    event: "pcf.liquidation.approved", liquidation_id: id, voucher_id: id, voucher_number: "1728", requester_name: "Justine",
    department: "Ops", filing_date: "2026-11-12", custodian_approved_at: "2026-11-12T01:00:00Z", custodian_id: id,
    amount_received: "300.00", total_spent: "250.00", return_amount: "50.00", reimbursement_amount: "0.00", lines: [line],
  };

  it("needs a listed company on every line", () => {
    expect(grokbotFinancialEvent.safeParse(event).success).toBe(true);
    expect(grokbotFinancialEvent.safeParse({ ...event, lines: [{ ...line, company: "venta" }] }).success).toBe(true);
    expect(grokbotFinancialEvent.safeParse({ ...event, lines: [{ ...line, company: "" }] }).success).toBe(false);
    expect(grokbotFinancialEvent.safeParse({ ...event, lines: [{ ...line, company: "SOMEONE ELSE" }] }).success).toBe(false);
    const { company: _unused, ...withoutCompany } = line;
    void _unused;
    expect(grokbotFinancialEvent.safeParse({ ...event, lines: [withoutCompany] }).success).toBe(false);
  });

  it("does not let a Buying line carry a company, nor name a mixed-up target", () => {
    const buying = GROKBOT_TARGETS.buying;
    const buyingTarget = { spreadsheet_id: buying.spreadsheet_id, sheet_id: buying.sheet_id, sheet_title: buying.sheet_title };
    expect(grokbotFinancialEvent.safeParse({ ...event, target: buyingTarget }).success).toBe(false);
    expect(grokbotFinancialEvent.safeParse({ ...event, target: { ...buyingTarget, sheet_id }, lines: [{ ...line, company: "" }] }).success).toBe(false);
  });

  it("accepts a completed DRYVE report only with its own checks", () => {
    const checks = Object.fromEntries(["amounts", "dates", "numbering", "running_balance", "summary_formulas", "expense_types_valid", "write_scope", "duplicate_free"].map((name) => [name, true]));
    const report = {
      verified: true, editor_account: "admin.manilaautodisplay@gmail.com", spreadsheet_id, sheet_id,
      audit_tab_id: 1208736198, audit_rows: "A3:V5", checks, before_balance: "50000.00", after_balance: "49750.00",
      in_amount: "0.00", out_amount: "250.00", rows_written: 1,
    };
    expect(validateFinancialResult(event, report)).toBe(true);
    // Buying's Input VAT check does not exist on this sheet, and the DRYVE check is required.
    expect(validateFinancialResult(event, { ...report, checks: { ...checks, expense_types_valid: false } })).toBe(false);
    expect(validateFinancialResult(event, { ...report, spreadsheet_id: GROKBOT_TARGETS.buying.spreadsheet_id })).toBe(false);
    expect(validateFinancialResult(event, { ...report, audit_tab_id: sheet_id })).toBe(false);
  });

  it("knows each sheet by its spreadsheet and keeps each bot's settings apart", () => {
    expect(targetForSpreadsheet(spreadsheet_id, sheet_id)?.book).toBe("dryve");
    expect(targetForSpreadsheet(GROKBOT_TARGETS.buying.spreadsheet_id)?.book).toBe("buying");
    expect(targetForSpreadsheet(spreadsheet_id, 1)).toBeNull();
    expect(GROKBOT_TARGETS.dryve.env).not.toEqual(GROKBOT_TARGETS.buying.env);
  });
});
