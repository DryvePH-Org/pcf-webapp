import { describe, expect, it } from "vitest";

import { latestReplenishmentNumber, sheetExpenseTags } from "@/lib/sheets/grid";
import { summarizeLedger } from "@/lib/sheets/ledger-summary";
import { parseExpenseRows } from "@/lib/sheets/parser";
import { snapshotSchemaFor } from "@/lib/grokbot/results";
import { GROKBOT_TARGETS, targetForSpreadsheet } from "@/lib/grokbot/targets";
import type { Cell } from "@/lib/sheets/types";

// A synthetic copy of the Operations "(NEW)" tab layout: ledger rows 7-30, TOTAL DISBURSEMENTS at row 31,
// sign-offs from row 34, tag totals in Q:T. Made-up amounts.
const TAGS = ["CE - TIRES", "CE - PAINT", "NCE - MEALS", "NCE - TRANSPORTATION", "NCE - REPAIR AND MAINTENANCE"];
const text = (value: string): Cell => ({ userEnteredValue: { stringValue: value }, effectiveValue: { stringValue: value }, formattedValue: value });
const num = (value: number, formula?: string): Cell => ({
  userEnteredValue: formula ? { formulaValue: formula } : { numberValue: value },
  effectiveValue: { numberValue: value },
  formattedValue: String(value),
});
const serial = (iso: string) => (Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86400000;
const col = (ref: string) => ref.charCodeAt(0) - 65;

function opsGrid(): Cell[][] {
  const grid: Cell[][] = Array.from({ length: 60 }, () => Array.from({ length: 21 }, () => ({}) as Cell));
  const set = (ref: string, cell: Cell) => {
    grid[Number(ref.slice(1)) - 1][col(ref)] = cell;
  };
  ["#", "TAG", "PCF#", "DATE", "PARTICULAR", "PLATE", "POINT PERSON", "COMPANY / PAYEE", "SI/OR#", "TIN NUMBER", "INPUT VAT", "IN", "OUT", "BALANCE"]
    .forEach((header, index) => set(`${String.fromCharCode(66 + index)}5`, text(header)));
  set("B1", text("MAD PARKING AND MANAGEMENT SOLUTIONS INC"));
  set("B6", text("BEGINNING BALANCE"));
  set("M6", num(100000));
  set("O6", num(100000, "=L6+M6-N6"));
  // Row 7: an expense. Row 8: a funded marker. Row 9: another expense. Rows 10-30 are the empty template.
  set("B7", num(1)); set("C7", text("NCE - MEALS")); set("D7", text("0001")); set("E7", num(serial("2026-11-12")));
  set("F7", text("TEAM LUNCH")); set("G7", text("N/A")); set("H7", text("JUSTINE")); set("I7", text("JOLLIBEE")); set("N7", num(250));
  set("O7", num(99750, "=O6+L7+M7-N7"));
  set("F8", text("PCF REPLENISHMENT #01")); set("M8", num(1000)); set("O8", num(100750, "=O7+L8:L30+M8:M30-N7:N30"));
  set("B9", num(2)); set("C9", text("CE - TIRES")); set("D9", text("0002")); set("E9", num(serial("2026-11-13")));
  set("F9", text("TIRE CHANGE")); set("G9", text("ABC 123")); set("H9", text("MARIEL")); set("I9", text("TIRE SHOP")); set("N9", num(100));
  set("O9", num(100650, "=O8+L9:L30+M9:M30-N8:N30"));
  for (let row = 10; row <= 30; row++) set(`O${row}`, num(100650, `=O${row - 1}+L${row}:L30+M${row}:M30-N${row - 1}:N30`));
  set("M31", text("TOTAL DISBURSEMENTS")); set("N31", num(350, "=SUM(N7:N30)"));
  set("D34", text("PREPARED BY:")); set("D37", text("CHECKED BY:")); set("D40", text("APPROVED BY:"));
  set("Q5", text("TOTAL IN:")); set("R5", text("TOTAL OUT:")); set("S5", text("BALANCE:"));
  set("Q6", num(101000, "=SUM($O$6,$L$7:$L$30,$M$7:$M$30)"));
  set("R6", num(350, "=SUM($N$6:$N$30)"));
  set("S6", num(100650, "=$Q$6-$R$6"));
  TAGS.forEach((tag, index) => {
    set(`Q${7 + index}`, text(tag));
    set(`T${7 + index}`, num(0, `=SUMIF($C$7:$C$30,"${tag}",$N$7:$N$30)`));
  });
  set("C48", text("SUMMARY OF ACCOUNTS"));
  TAGS.slice(0, 2).forEach((tag, index) => {
    set(`C${49 + index}`, text(tag));
    set(`E${49 + index}`, num(0, `=SUMIF($C$7:$C$30,"${tag}",$N$7:$N$30)`));
  });
  return grid;
}

describe("the Operations (NEW) sheet layout", () => {
  const grid = opsGrid();

  it("finds the ledger, the opening balance in M6 and the end at TOTAL DISBURSEMENTS", () => {
    const summary = summarizeLedger(grid)!;
    expect(summary.opening_balance).toBe(100000);
    expect(summary.inflows).toBe(101000); // the sheet's TOTAL IN includes the beginning balance
    expect(summary.outflows).toBe(350);
    expect(summary.expense_rows).toBe(2);
    expect(summary.ledger_balance).toBe(100650);
    expect(summary.balanced).toBe(true);
    expect(summary.formula_errors).toBe(0);
  });

  it("reads the expense tags from the summary tables", () => {
    const tags = sheetExpenseTags(grid);
    expect(tags).toContain("CE - TIRES");
    expect(tags).toContain("NCE - MEALS");
  });

  it("counts a marker once its row holds an amount in IN (column M)", () => {
    expect(latestReplenishmentNumber(grid, 12)).toBe(1);
    const unfunded = opsGrid();
    unfunded[7][12] = {};
    expect(latestReplenishmentNumber(unfunded, 12)).toBe(0);
  });

  it("reads expense rows and skips the marker", () => {
    const expenses = parseExpenseRows("operations", GROKBOT_TARGETS.operations.sheet_id, "PCF REPLENISHMENT #1 (NEW)", grid);
    expect(expenses).toHaveLength(2);
    expect(expenses[0]).toMatchObject({ source_row: 7, expense_date: "2026-11-12", amount: 250, category: "NCE - MEALS", person: "JUSTINE", supplier: "JOLLIBEE" });
    expect(expenses[1]).toMatchObject({ source_row: 9, category: "CE - TIRES", plate: "ABC 123" });
  });

  it("accepts a snapshot of its own tab only, even though the grid is smaller than the other books", () => {
    const schema = snapshotSchemaFor(GROKBOT_TARGETS.operations);
    const { spreadsheet_id, sheet_id, sheet_title } = GROKBOT_TARGETS.operations;
    expect(schema.safeParse({ spreadsheet_id, sheet_id, sheet_title, grid: opsGrid() }).success).toBe(true);
    expect(schema.safeParse({ ...GROKBOT_TARGETS.buying, grid: opsGrid() }).success).toBe(false);
  });

  it("is its own target with its own bot settings", () => {
    const { spreadsheet_id, sheet_id } = GROKBOT_TARGETS.operations;
    expect(targetForSpreadsheet(spreadsheet_id, sheet_id)?.book).toBe("operations");
    expect(GROKBOT_TARGETS.operations.env).not.toEqual(GROKBOT_TARGETS.buying.env);
    expect(GROKBOT_TARGETS.operations.env).not.toEqual(GROKBOT_TARGETS.dryve.env);
  });
});
