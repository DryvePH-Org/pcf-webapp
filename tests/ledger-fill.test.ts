import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { addExportNote, currentLedger, fillLedger, findLedger, tidyValidations, type LedgerEntry } from "@/lib/export/ledger-fill";

const entry = (n: number, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  date: `2026-11-${String(10 + n).padStart(2, "0")}`, tag: "MEALS", voucher: `00${n}`, particulars: `Line ${n}`, plate: "", person: "A Person",
  payee: "A Shop", receipt_number: "", tin: "", company: "ACME", amount: 100 * n, ...over,
});

// One layout like a header in column B with a single beginning-balance row ...
function stacked() {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Notes").getCell("A1").value = "just notes";
  const ws = wb.addWorksheet("PCF NOV");
  ws.getCell("B5").value = "#"; ws.getCell("C5").value = "TAG"; ws.getCell("D5").value = "PCF#"; ws.getCell("E5").value = "DATE";
  ws.getCell("F5").value = "PARTICULAR"; ws.getCell("G5").value = "PLATE"; ws.getCell("H5").value = "POINT PERSON"; ws.getCell("I5").value = "COMPANY / PAYEE";
  ws.getCell("K5").value = "TIN NUMBER"; ws.getCell("L5").value = "INPUT VAT"; ws.getCell("M5").value = "IN"; ws.getCell("N5").value = "OUT"; ws.getCell("O5").value = "BALANCE";
  ws.getCell("Q5").value = "TOTAL IN:"; ws.getCell("R5").value = "TOTAL OUT:";
  ws.getCell("B6").value = "BEGINNING BALANCE"; ws.getCell("O6").value = 1000;
  ws.getCell("Q6").value = { formula: "SUM(O6,L7:L9,M7:M9)", result: 1000 };
  ws.getCell("R6").value = { formula: "SUM(N7:N11)", result: 0 };
  for (let r = 7; r <= 11; r++) {
    ws.getCell(`B${r}`).value = { formula: `B${r - 1}+1`, result: r - 6 };
    ws.getCell(`O${r}`).value = { formula: `O${r - 1}+L${r}+M${r}-N${r}`, result: 1000 };
  }
  ws.getCell("C7").dataValidation = { type: "list", formulae: ["Notes!$A$1:$A$3"] };
  return wb;
}

// ... and one with the header in column A, three opening rows and a company column.
function opening() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("OTHER");
  ["NO", "DATE", "COMPANY", "EXPENSE TYPE", "PCF VOUCHER #", "PARTICULARS", "PLATE#", "POINT PERSON", "PAYEE/COMPANY", "IN", "OUT", "BALANCE"]
    .forEach((text, i) => (ws.getCell(4, i + 1).value = text));
  ws.getCell("B5").value = "BALANCE FORWARDED"; ws.getCell("L5").value = { formula: "Prev!L9", result: 500 };
  ws.getCell("B6").value = "REPLENISHMENT #2"; ws.getCell("J6").value = { formula: "Prev!K9", result: 300 }; ws.getCell("L6").value = { formula: "L5+J6-K6", result: 800 };
  ws.getCell("B7").value = "ADDITIONAL FUND"; ws.getCell("J7").value = 200; ws.getCell("L7").value = { formula: "L6+J7-K7", result: 1000 };
  for (let r = 8; r <= 12; r++) {
    ws.getCell(`A${r}`).value = r === 8 ? 1 : { formula: `A${r - 1}+1`, result: r - 7 };
    ws.getCell(`L${r}`).value = { formula: `L${r - 1}+J${r}-K${r}`, result: 1000 };
  }
  ws.getCell("D8").value = "CASH ADVANCE"; // an expense type that looks like an opening label must not confuse the search
  return wb;
}

describe("finding the ledger", () => {
  it("skips tabs without one and reads the columns by their titles", () => {
    const found = currentLedger(stacked());
    expect(found?.layout).toMatchObject({ sheet: "PCF NOV", headerRow: 5, firstRow: 7, lastRow: 11 });
    expect(found?.layout.columns).toMatchObject({ no: 2, tag: 3, voucher: 4, date: 5, payee: 9, tin: 11, vat: 12, in: 13, out: 14, balance: 15 });
  });
  it("steps over several opening rows", () => {
    const layout = findLedger(opening().worksheets[0]);
    expect(layout).toMatchObject({ headerRow: 4, firstRow: 8, lastRow: 12 });
    expect(layout?.columns).toMatchObject({ no: 1, date: 2, company: 3, tag: 4, voucher: 5, person: 8, payee: 9, in: 10, out: 11, balance: 12 });
  });
  it("refuses a workbook with no ledger", () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Notes").getCell("A1").value = "nothing";
    expect(() => fillLedger(wb, [])).toThrow(/no ledger/);
  });
});

describe("filling the ledger", () => {
  it("writes the entries, numbers them and leaves the balance formulas", () => {
    const wb = stacked();
    const report = fillLedger(wb, [entry(1), entry(2)]);
    const ws = wb.getWorksheet("PCF NOV")!;
    expect(report).toMatchObject({ entries: 2, capacity: 5, totalOut: 300, openingBalance: 1000, closingBalance: 700 });
    expect(ws.getCell("B7").value).toBe(1);
    expect(ws.getCell("C7").value).toBe("MEALS");
    expect(ws.getCell("D7").value).toBe("001");
    expect(ws.getCell("E7").value).toEqual(new Date(Date.UTC(2026, 10, 11)));
    expect(ws.getCell("G7").value).toBe("N/A");
    expect(ws.getCell("N8").value).toBe(200);
    expect(ws.getCell("O7").value).toEqual({ formula: "O6+L7+M7-N7", result: 1000 });
    // an unused row keeps the number formula and has nothing typed in it
    expect(ws.getCell("B9").value).toMatchObject({ formula: "B8+1" });
    expect(ws.getCell("N9").value).toBeNull();
    expect(wb.calcProperties.fullCalcOnLoad).toBe(true);
  });

  it("clears the template's sample rows that the app no longer has", () => {
    const wb = stacked();
    const ws = wb.getWorksheet("PCF NOV")!;
    ws.getCell("B10").value = 4; ws.getCell("F10").value = "Old sample"; ws.getCell("N10").value = 999;
    fillLedger(wb, [entry(1)]);
    expect(ws.getCell("F10").value).toBeNull();
    expect(ws.getCell("N10").value).toBeNull();
    expect(ws.getCell("B10").value).toMatchObject({ formula: "B9+1" });
  });

  it("keeps a hand-typed input VAT only while its entry is unchanged", () => {
    const wb = stacked();
    const ws = wb.getWorksheet("PCF NOV")!;
    ws.getCell("F7").value = "Line 1"; ws.getCell("N7").value = 100; ws.getCell("L7").value = 12;
    ws.getCell("F8").value = "Gone"; ws.getCell("N8").value = 50; ws.getCell("L8").value = 6;
    const report = fillLedger(wb, [entry(1), entry(2)]);
    expect(ws.getCell("L7").value).toBe(12);
    expect(ws.getCell("L8").value).toBeNull();
    expect(report.closingBalance).toBe(1000 + 12 - 300);
    expect(report.warnings.join(" ")).toMatch(/input VAT/);
  });

  it("stretches a total that stops before the last ledger row", () => {
    const wb = stacked();
    const report = fillLedger(wb, [entry(1)]);
    expect(wb.getWorksheet("PCF NOV")!.getCell("Q6").value).toMatchObject({ formula: "SUM(O6,L7:L11,M7:M11)" });
    expect(report.warnings.join(" ")).toMatch(/TOTAL IN/);
  });

  it("fills a layout with a company column and several opening rows, keeping the opening balance", () => {
    const wb = opening();
    const report = fillLedger(wb, [entry(1), entry(2, { tag: "FUEL" })]);
    const ws = wb.getWorksheet("OTHER")!;
    expect(report).toMatchObject({ capacity: 5, openingBalance: 1000, closingBalance: 700 });
    expect(ws.getCell("A8").value).toBe(1);
    expect(ws.getCell("C8").value).toBe("ACME");
    expect(ws.getCell("D9").value).toBe("FUEL");
    expect(ws.getCell("J7").value).toBe(200);
    expect(ws.getCell("L7").value).toMatchObject({ formula: "L6+J7-K7" });
    expect(ws.getCell("K9").value).toBe(200);
  });

  it("stops when the template has no room", () => {
    expect(() => fillLedger(stacked(), Array.from({ length: 6 }, (_, i) => entry(i + 1)))).toThrow(/room for 5 lines/);
  });
});

describe("the saved file", () => {
  it("writes each dropdown once, even when its rows cross from 9 to 10", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Ledger");
    for (let r = 7; r <= 14; r++) ws.getCell(`C${r}`).dataValidation = { type: "list", formulae: ["Ledger!$Z$1:$Z$3"] };
    tidyValidations(wb);
    const model = (ws as unknown as { dataValidations: { model: Record<string, unknown> } }).dataValidations.model;
    expect(Object.keys(model)).toEqual(["C7:C14"]);
  });

  it("records where the numbers came from on its own tab", () => {
    const wb = stacked();
    const report = fillLedger(wb, [entry(1)]);
    addExportNote(wb, { fund: "Test fund", generatedAt: "2026-11-19T00:00:00Z", report, appClosing: report.closingBalance });
    const note = wb.getWorksheet("PCF APP EXPORT")!;
    expect(note.getCell("A1").value).toMatch(/PCF app database/);
    expect(note.getCell("B10").value).toBe("YES");
    expect(wb.worksheets[0].name).toBe("Notes");
  });
});
