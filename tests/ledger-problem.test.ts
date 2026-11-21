import { describe, expect, it } from "vitest";

import { ledgerProblem, summarizeLedger } from "@/lib/sheets/ledger-summary";
import type { Cell } from "@/lib/sheets/types";

const text = (value: string): Cell => ({ userEnteredValue: { stringValue: value }, effectiveValue: { stringValue: value }, formattedValue: value });
const num = (value: number): Cell => ({ effectiveValue: { numberValue: value }, userEnteredValue: { numberValue: value } });
const row = (cells: Record<number, Cell>, width = 15): Cell[] => Array.from({ length: width }, (_, i) => cells[i] ?? {});
// header: DATE(4) OUT(13) IN(12) BALANCE(14)
const header = row({ 4: text("DATE"), 12: text("IN"), 13: text("OUT"), 14: text("BALANCE") });

describe("reading a sheet that staff have dressed up", () => {
  it("accepts a snapshot that stops at the last used row (no total or sign-off rows came with it)", () => {
    const grid = [header, row({ 1: text("BEGINNING BALANCE"), 14: num(1000) }), row({ 13: num(100), 14: num(900) }), row({ 13: num(50), 14: num(850) })];
    const summary = summarizeLedger(grid);
    expect(summary).toMatchObject({ outflows: 150, ledger_balance: 850, formula_errors: 0 });
    expect(ledgerProblem(grid, summary)).toBeNull();
  });

  it("an empty divider row between entries, and a typed marker with no amount, do not break it", () => {
    const grid = [
      header,
      row({ 1: text("BEGINNING BALANCE"), 14: num(1000) }),
      row({ 13: num(100), 14: num(900) }),
      row({}), // a colored divider: no values
      row({ 1: text("REPLENISHMENT #13"), 14: num(900) }), // typed in advance
      row({ 13: num(372), 14: num(528) }),
      row({ 3: text("PREPARED BY:") }),
    ];
    const summary = summarizeLedger(grid);
    expect(summary).toMatchObject({ outflows: 472, ledger_balance: 528 });
    expect(ledgerProblem(grid, summary)).toBeNull();
  });

  it("names the cells of a formula error", () => {
    const grid = [header, row({ 1: text("BEGINNING BALANCE"), 14: num(1000) }), row({ 13: num(100), 14: text("#REF!") })];
    const message = ledgerProblem(grid, summarizeLedger(grid));
    expect(message).toMatch(/formula errors \(O3\)/);
  });

  it("says when the printed total stops early, and when there is no ledger at all", () => {
    const grid = [
      header,
      row({ 1: text("BEGINNING BALANCE"), 14: num(1000) }),
      row({ 13: num(100), 14: num(900) }),
      row({ 13: num(50), 14: num(850) }),
      row({ 12: { userEnteredValue: { formulaValue: "=SUM(N3:N3)" } }, 13: { userEnteredValue: { formulaValue: "=SUM(N3:N4)" }, effectiveValue: { numberValue: 100 } } }),
    ];
    expect(ledgerProblem(grid, summarizeLedger(grid))).toMatch(/does not match the expense rows/);
    expect(ledgerProblem([row({ 1: text("nothing here") })], summarizeLedger([row({ 1: text("nothing here") })]))).toMatch(/no readable ledger/);
  });
});
