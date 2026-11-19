// Fills a fund's own Excel ledger template with the app's data. Each fund's sheet is laid
// out differently (columns, opening rows, summary blocks), so nothing here is tied to one
// layout: the header row and the columns are found by their titles, the entry rows are the
// ones that carry the running-balance formula, and everything else in the template (summary
// formulas, older tabs, sign-offs, formatting) is left exactly as it was.
import type ExcelJS from "exceljs";

export type LedgerEntry = {
  date: string | null; // YYYY-MM-DD
  tag: string;
  voucher: string;
  particulars: string;
  plate: string;
  person: string;
  payee: string;
  receipt_number: string;
  tin: string;
  company: string;
  amount: number;
};

export type LedgerColumns = Partial<
  Record<
    | "no" | "tag" | "voucher" | "date" | "particulars" | "plate" | "person" | "payee"
    | "company" | "receipt" | "tin" | "vat" | "in" | "out" | "balance",
    number
  >
>;

export type LedgerLayout = {
  sheet: string;
  headerRow: number;
  firstRow: number;
  lastRow: number;
  columns: LedgerColumns & { date: number; out: number; balance: number };
};

export type FillReport = {
  sheet: string;
  entries: number;
  capacity: number;
  totalOut: number;
  openingBalance: number | null;
  closingBalance: number | null;
  warnings: string[];
};

const cents = (value: number) => Math.round(value * 100);
const pesos = (value: number) => value / 100;

function isFormulaValue(value: ExcelJS.CellValue): value is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
  return typeof value === "object" && value !== null && ("formula" in value || "sharedFormula" in value);
}

function textOf(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value && typeof value.result === "string") return value.result;
    if ("text" in value && typeof value.text === "string") return value.text;
  }
  return "";
}

function numberOf(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "result" in value && typeof value.result === "number") return value.result;
  return null;
}

const label = (cell: ExcelJS.Cell) => textOf(cell.value).trim().toUpperCase();

function columnsOf(row: ExcelJS.Row) {
  const found: Partial<Record<keyof LedgerColumns, number>> = {};
  const set = (key: keyof LedgerColumns, column: number) => {
    if (found[key] === undefined) found[key] = column;
  };
  row.eachCell({ includeEmpty: false }, (cell, column) => {
    const text = label(cell);
    if (!text) return;
    if (text === "#" || text === "NO" || text === "NO.") set("no", column);
    else if (text === "TAG" || text === "EXPENSE TYPE") set("tag", column);
    else if (text.startsWith("PCF")) set("voucher", column);
    else if (text === "DATE") set("date", column);
    else if (text.startsWith("PARTICULAR")) set("particulars", column);
    else if (text.startsWith("PLATE")) set("plate", column);
    else if (text === "POINT PERSON") set("person", column);
    else if (text.includes("PAYEE")) set("payee", column);
    else if (text === "COMPANY") set("company", column);
    else if (text.startsWith("SI/OR")) set("receipt", column);
    else if (text.startsWith("TIN")) set("tin", column);
    else if (text === "INPUT VAT") set("vat", column);
    else if (text === "IN") set("in", column);
    else if (text === "OUT") set("out", column);
    else if (text === "BALANCE") set("balance", column);
  });
  return found;
}

const OPENING = /BALANCE|REPLENISHMENT|ADDITIONAL|ADVANCE|FUND/;

// The ledger of a worksheet, or null when it has none (a notes tab, the audit tab).
export function findLedger(ws: ExcelJS.Worksheet): LedgerLayout | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
    const columns = columnsOf(ws.getRow(r));
    if (columns.date === undefined || columns.out === undefined || columns.balance === undefined) continue;
    const balance = columns.balance;
    // Opening rows (beginning balance, balance forwarded, replenishment, additional fund) sit
    // between the header and the first entry; they have a label and no date.
    let first = r + 1;
    while (first < r + 12) {
      const row = ws.getRow(first);
      // The label sits in the number or date column; an entry row has a number there instead.
      const near = [columns.no, columns.date].filter((c): c is number => c !== undefined);
      const numbered = columns.no !== undefined && (typeof row.getCell(columns.no).value === "number" || isFormulaValue(row.getCell(columns.no).value));
      const opening = !numbered && near.some((c) => OPENING.test(label(row.getCell(c))));
      if (!opening) break;
      first++;
    }
    let last = first;
    while (isFormulaValue(ws.getRow(last + 1).getCell(balance).value)) last++;
    if (!isFormulaValue(ws.getRow(first).getCell(balance).value)) continue;
    return { sheet: ws.name, headerRow: r, firstRow: first, lastRow: last, columns: { ...columns, date: columns.date, out: columns.out, balance } };
  }
  return null;
}

// The current period is the first tab that has a ledger (older periods follow it).
export function currentLedger(workbook: ExcelJS.Workbook): { ws: ExcelJS.Worksheet; layout: LedgerLayout } | null {
  for (const ws of workbook.worksheets) {
    const layout = findLedger(ws);
    if (layout) return { ws, layout };
  }
  return null;
}

// A shared formula is stored once and pointed at by its neighbours, so overwriting its first
// cell would break the rest. Write each one out in full before changing anything.
function unshare(ws: ExcelJS.Worksheet) {
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      if (typeof value === "object" && value !== null && "sharedFormula" in value) {
        const formula = cell.formula;
        if (formula) cell.value = { formula, result: value.result } as ExcelJS.CellFormulaValue;
      }
    });
  });
}

// ExcelJS keeps a dropdown per cell and groups them again when saving, but it sorts the cell
// names as text (C10 before C7), so a range crossing row 9 to 10 is written twice, overlapping.
// Group them here, once, so the saved file has each dropdown exactly once.
export function tidyValidations(workbook: ExcelJS.Workbook) {
  for (const ws of workbook.worksheets) {
    const model = (ws as unknown as { dataValidations: { model: Record<string, ExcelJS.DataValidation> } }).dataValidations.model;
    const cells = Object.keys(model).filter((key) => /^[A-Z]+\d+$/.test(key));
    if (cells.length < 2) continue;
    const parsed = cells.map((key) => {
      const [, column, row] = /^([A-Z]+)(\d+)$/.exec(key) as RegExpExecArray;
      return { key, column, row: Number(row), rule: JSON.stringify(model[key]) };
    });
    parsed.sort((a, b) => (a.column === b.column ? a.row - b.row : a.column.length - b.column.length || (a.column < b.column ? -1 : 1)));
    const grouped: Record<string, ExcelJS.DataValidation> = {};
    for (let i = 0; i < parsed.length; ) {
      let end = i;
      while (end + 1 < parsed.length && parsed[end + 1].column === parsed[i].column && parsed[end + 1].rule === parsed[i].rule && parsed[end + 1].row === parsed[end].row + 1) end++;
      const name = end === i ? parsed[i].key : `${parsed[i].key}:${parsed[end].key}`;
      grouped[name] = model[parsed[i].key];
      i = end + 1;
    }
    for (const key of Object.keys(model)) if (!(key in grouped) && cells.includes(key)) delete model[key];
    Object.assign(model, grouped);
  }
}

function toDate(iso: string | null) {
  const match = iso && /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

// Stretches a total whose range stops short of the last ledger row (the old Q6 formula ended
// at row 76 while the ledger ran to row 79).
function extendTotals(ws: ExcelJS.Worksheet, layout: LedgerLayout, warnings: string[]) {
  const header = ws.getRow(layout.headerRow);
  const below = ws.getRow(layout.headerRow + 1);
  header.eachCell({ includeEmpty: false }, (cell, column) => {
    if (!/^TOTAL (IN|OUT)/.test(label(cell))) return;
    const target = below.getCell(column);
    const value = target.value;
    if (!isFormulaValue(value) || !("formula" in value) || !value.formula) return;
    let changed = false;
    const formula = value.formula.replace(/(\$?[A-Z]+)(\$?)(\d+):(\$?[A-Z]+)(\$?)(\d+)/g, (whole, c1, d1, r1, c2, d2, r2) => {
      const from = Number(r1), to = Number(r2);
      if (from < layout.firstRow || from > layout.lastRow || to >= layout.lastRow || to < layout.firstRow) return whole;
      changed = true;
      return `${c1}${d1}${r1}:${c2}${d2}${layout.lastRow}`;
    });
    if (changed) {
      target.value = { formula, result: value.result } as ExcelJS.CellFormulaValue;
      warnings.push(`The "${textOf(cell.value).trim()}" total stopped before the last ledger row; it now covers row ${layout.lastRow}.`);
    }
  });
}

export function fillLedger(workbook: ExcelJS.Workbook, entries: LedgerEntry[]): FillReport {
  const current = currentLedger(workbook);
  if (!current) throw new Error("This template has no ledger tab (a header row with DATE, OUT and BALANCE).");
  const { ws, layout } = current;
  const { columns } = layout;
  const warnings: string[] = [];
  const capacity = layout.lastRow - layout.firstRow + 1;
  if (entries.length > capacity)
    throw new Error(`The ledger has room for ${capacity} lines but there are ${entries.length}. Add rows to the template's ledger first.`);
  unshare(ws);
  tidyValidations(workbook);
  // Every other formula in the file keeps the answer it had in the template, so ask Excel to work them out again on opening.
  workbook.calcProperties.fullCalcOnLoad = true;

  const opening = numberOf(ws.getRow(layout.firstRow - 1).getCell(columns.balance).value);
  const values: [keyof LedgerColumns, (entry: LedgerEntry) => string | number | Date | null][] = [
    ["tag", (e) => e.tag],
    ["voucher", (e) => e.voucher],
    ["date", (e) => toDate(e.date)],
    ["particulars", (e) => e.particulars],
    ["plate", (e) => e.plate || "N/A"],
    ["person", (e) => e.person],
    ["payee", (e) => e.payee || "N/A"],
    ["company", (e) => e.company],
    ["receipt", (e) => e.receipt_number],
    ["tin", (e) => e.tin || "N/A"],
    ["out", (e) => e.amount],
  ];

  let keptVat = 0;
  let totalIn = 0;
  for (let i = 0; i < capacity; i++) {
    const rowNumber = layout.firstRow + i;
    const row = ws.getRow(rowNumber);
    const entry = entries[i];
    const previous = {
      particulars: columns.particulars ? textOf(row.getCell(columns.particulars).value).trim() : "",
      out: numberOf(row.getCell(columns.out).value),
    };
    for (const [key, read] of values) {
      const column = columns[key];
      if (column === undefined) continue;
      row.getCell(column).value = entry ? read(entry) : null;
    }
    if (columns.no !== undefined) {
      const cell = row.getCell(columns.no);
      if (entry) cell.value = i + 1;
      else if (i === 0) cell.value = null;
      else {
        const letter = ws.getColumn(columns.no).letter;
        cell.value = { formula: `${letter}${rowNumber - 1}+1`, result: undefined } as ExcelJS.CellFormulaValue;
      }
    }
    // Input VAT and money-in typed by hand into the sheet are not in the app: keep them only
    // while the row still holds the entry they were typed against.
    for (const key of ["vat", "in"] as const) {
      const column = columns[key];
      if (column === undefined) continue;
      const cell = row.getCell(column);
      const held = numberOf(cell.value);
      if (held === null || isFormulaValue(cell.value)) continue;
      const sameEntry = entry && previous.particulars === entry.particulars.trim() && previous.out !== null && cents(previous.out) === cents(entry.amount);
      if (sameEntry) {
        totalIn += cents(held);
        if (key === "vat") keptVat++;
      } else {
        cell.value = null;
        warnings.push(`Row ${rowNumber}: a hand-typed ${key === "vat" ? "input VAT" : "IN"} amount of ${held.toFixed(2)} no longer matches an entry and was cleared.`);
      }
    }
  }
  if (keptVat) warnings.push(`${keptVat} input VAT amount${keptVat === 1 ? "" : "s"} typed in the sheet (not in the app) were kept from the template.`);

  extendTotals(ws, layout, warnings);

  const totalOut = entries.reduce((sum, entry) => sum + cents(entry.amount), 0);
  const base = opening === null ? null : cents(opening);
  return {
    sheet: ws.name,
    entries: entries.length,
    capacity,
    totalOut: pesos(totalOut),
    openingBalance: opening,
    closingBalance: base === null ? null : pesos(base + totalIn - totalOut),
    warnings,
  };
}

// The export is one period: the tab being filled. Older periods are history from before the app and are
// left out, so the few links from this tab into them are settled first: a formula that read another tab
// keeps the number it showed, and a dropdown list that lived on another tab points at this tab's own list.
export function keepCurrentTabOnly(workbook: ExcelJS.Workbook, warnings: string[]) {
  const current = currentLedger(workbook);
  if (!current) return;
  const { ws } = current;
  const others = workbook.worksheets.filter((sheet) => sheet.id !== ws.id);
  if (!others.length) return;
  const reference = /(?:'((?:[^']|'')+)'|([A-Za-z0-9_.]+))!/g;
  const leavesThisTab = (text: string) =>
    [...text.matchAll(reference)].some((match) => (match[1] ?? match[2]).replace(/''/g, "'") !== ws.name);

  const settled: string[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      if (isFormulaValue(value) && "formula" in value && value.formula && leavesThisTab(value.formula)) {
        cell.value = typeof value.result === "number" || typeof value.result === "string" ? value.result : null;
        settled.push(cell.address);
      }
    });
  });
  if (settled.length) warnings.push(`${settled.join(", ")} used to read an older tab and now hold the value they had (${settled.length === 1 ? "it" : "they"} no longer follow${settled.length === 1 ? "s" : ""} it).`);

  const own = `'${ws.name.replace(/'/g, "''")}'!`;
  const model = (ws as unknown as { dataValidations: { model: Record<string, ExcelJS.DataValidation> } }).dataValidations.model;
  for (const validation of Object.values(model)) {
    validation.formulae = validation.formulae?.map((text) =>
      typeof text === "string" && leavesThisTab(text) ? text.replace(reference, own) : text,
    );
  }
  for (const sheet of others) workbook.removeWorksheet(sheet.id);
  warnings.push(`Only the current period (${ws.name}) is in this file; older periods are not included.`);
}

// A small tab at the end of the file records where the numbers came from.
export function addExportNote(workbook: ExcelJS.Workbook, input: { fund: string; generatedAt: string; report: FillReport; appClosing: number | null }) {
  const name = "PCF APP EXPORT";
  const existing = workbook.getWorksheet(name);
  if (existing) workbook.removeWorksheet(existing.id);
  const ws = workbook.addWorksheet(name);
  const { report } = input;
  const rows: (string | number)[][] = [
    ["Exported from the PCF app database (not from the Google Sheet)"],
    ["Fund", input.fund],
    ["Generated", input.generatedAt],
    ["Ledger tab filled", report.sheet],
    ["Entries", report.entries],
    ["Total OUT", report.totalOut],
    ["Opening balance in the template", report.openingBalance ?? "not found"],
    ["Closing balance of the file", report.closingBalance ?? "not found"],
    ["Closing balance the app expects", input.appClosing ?? "not available"],
    ["Matches the app", report.closingBalance !== null && input.appClosing !== null ? (cents(report.closingBalance) === cents(input.appClosing) ? "YES" : "NO - see warnings") : "not checked"],
    [],
    ["Notes"],
    ...report.warnings.map((warning) => [warning]),
  ];
  rows.forEach((row) => ws.addRow(row));
  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 40;
  ws.getRow(1).font = { bold: true };
  ws.getRow(12).font = { bold: true };
}
