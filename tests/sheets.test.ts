import { findLedgerBoundary, sheetExpenseTags } from "@/lib/sheets/grid";
import { describe, it, expect } from "vitest";
import { parseExpenseRows } from "@/lib/sheets/parser";
import type { Cell } from "@/lib/sheets/types";
const s = (value: string): Cell => ({
  userEnteredValue: { stringValue: value },
});
const n = (value: number): Cell => ({
  userEnteredValue: { numberValue: value },
  effectiveValue: { numberValue: value },
});
const grid: Cell[][] = [
  [],
  [],
  [],
  [],
  [
    "#",
    "TAG",
    "PCF#",
    "DATE",
    "PARTICULAR",
    "PLATE",
    "POINT PERSON",
    "COMPANY / PAYEE",
    "SI/OR#",
    "TIN NUMBER",
    "INPUT VAT",
    "IN",
    "OUT",
    "BALANCE",
  ].map(s),
  [s("BEGINNING BALANCE")],
  [s("REPLENISHMENT #1")],
  [
    n(1),
    s("CE - FUEL"),
    s("V-1"),
    n(46300),
    s("Fuel"),
    s("ABC123"),
    s("Employee"),
    s("Supplier"),
    s("R-1"),
    s(""),
    {},
    n(0),
    n(100),
    n(900),
  ],
  [],
  [...Array.from({ length: 12 }, () => ({})), s("TOTAL DISBURSEMENTS")],
];
describe("sheet import and planning safeguards", () => {
  it("imports expense rows with provenance but skips balances and totals", () => {
    const rows = parseExpenseRows("operations", 7, "PCF #1", grid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      voucher: "V-1",
      amount: 100,
      source_row: 8,
      supplier: "Supplier",
    });
  });
  it("imports computed ledger amounts while excluding footer summaries", () => {
    const copied = structuredClone(grid);
    copied[7][12] = {
      userEnteredValue: { formulaValue: "=SUM(A1:A2)" },
      effectiveValue: { numberValue: 100 },
    };
    copied.push([...copied[7]]);
    expect(parseExpenseRows("operations", 7, "PCF #1", copied)).toHaveLength(1);
  });
});

describe("workbook-specific ledger boundaries", () => {
  it("accepts the singular Selling subtotal label", () => {
    const rows = structuredClone(grid);
    rows[9][12] = s("TOTAL DISBURSEMENT");
    expect(findLedgerBoundary(rows, 4, 12)).toBe(9);
  });
  it("finds an unlabeled Dryve subtotal before its later cash summary", () => {
    const rows = structuredClone(grid);
    rows[9][12] = { userEnteredValue: { formulaValue: "=SUM(M6:M9)" } };
    rows.push([s("TOTAL DISBURSEMENT")]);
    expect(findLedgerBoundary(rows, 4, 12)).toBe(9);
  });
});

it("offers unused CE and NCE Others tags from account summary formulas", () => {
  const tags = sheetExpenseTags([
    [
      {
        userEnteredValue: {
          formulaValue: '=SUMIF(B8:B99,"CE - OTHERS",M8:M99)',
        },
      },
      {
        userEnteredValue: {
          formulaValue: '=SUMIF(B8:B99,"NCE - OTHERS",M8:M99)',
        },
      },
    ],
  ]);
  expect(tags).toEqual(["CE - OTHERS", "NCE - OTHERS"]);
});

it("recognizes the continuous Buying ledger's signoff boundary", () => {
  const rows = structuredClone(grid);
  rows[9] = [{}, {}, {}, s("PREPARED BY:")];
  expect(findLedgerBoundary(rows, 4, 12)).toBe(9);
  expect(parseExpenseRows("buying", 1042918180, "Buying", rows)).toHaveLength(
    1,
  );
});
