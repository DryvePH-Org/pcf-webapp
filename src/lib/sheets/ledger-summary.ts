import type { Cell } from "./types";
import { findLedgerBoundary } from "./grid";
export type LedgerSummary = {
  opening_balance: number | null;
  inflows: number;
  outflows: number;
  ledger_balance: number | null;
  cash_on_hand: number | null;
  unliquidated: number | null;
  expense_rows: number;
  balance_cell: string | null;
  cash_cell: string | null;
  formula_errors: number;
  balanced: boolean | null;
};
const text = (cell?: Cell) =>
  String(
    cell?.formattedValue ??
      cell?.effectiveValue?.stringValue ??
      cell?.userEnteredValue?.stringValue ??
      "",
  ).trim();
const numeric = (cell?: Cell) =>
  cell?.effectiveValue?.numberValue ?? cell?.userEnteredValue?.numberValue;
const columnName = (index: number) => {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
};
export function summarizeLedger(grid: Cell[][]): LedgerSummary | null {
  const header = grid.findIndex(
    (row) =>
      row.some((cell) => text(cell).toUpperCase() === "DATE") &&
      row.some((cell) => text(cell).toUpperCase() === "OUT"),
  );
  if (header < 0) return null;
  const headers = grid[header].map((cell) => text(cell).toUpperCase());
  const incoming = headers.indexOf("IN"),
    outgoing = headers.indexOf("OUT"),
    balance = headers.indexOf("BALANCE");
  if (incoming < 0 || outgoing < 0 || balance < 0) return null;
  let boundary = findLedgerBoundary(grid, header, outgoing);
  if (boundary < 0) {
    // No total or sign-off row came with the snapshot (a sheet read that stopped at the last used row):
    // the ledger then simply runs to the last row that holds an amount.
    let last = -1;
    for (let index = grid.length - 1; index > header && last < 0; index--)
      if ([incoming, outgoing, balance].some((column) => numeric(grid[index]?.[column]) !== undefined)) last = index;
    if (last < 0) return null;
    boundary = last + 1;
  }
  let opening: number | null = null,
    closing: number | null = null,
    balanceCell: string | null = null,
    inflows = 0,
    outflows = 0,
    expenseRows = 0;
  for (let index = header + 1; index < boundary; index++) {
    const row = grid[index] ?? [],
      received = numeric(row[incoming]),
      spent = numeric(row[outgoing]),
      remaining = numeric(row[balance]);
    if (opening === null && remaining !== undefined) opening = remaining;
    if (received !== undefined) inflows += received;
    if (spent !== undefined) {
      outflows += spent;
      if (spent > 0) expenseRows++;
    }
    if (/^#/.test(text(row[balance]))) {
      closing = null;
      balanceCell = `${columnName(balance)}${index + 1}`;
    }
    if (remaining !== undefined) {
      closing = remaining;
      balanceCell = `${columnName(balance)}${index + 1}`;
    }
  }
  function labelledNumber(pattern: RegExp): {
    amount: number | null;
    cell: string | null;
  } {
    for (let index = boundary; index < grid.length; index++) {
      const row = grid[index] ?? [];
      const label = row.findIndex((cell) => pattern.test(text(cell)));
      if (label < 0) continue;
      for (let col = label + 1; col < Math.min(row.length, label + 5); col++) {
        if (/^#(REF!|VALUE!|DIV\/0!|N\/A|ERROR!)/.test(text(row[col])))
          return { amount: null, cell: `${columnName(col)}${index + 1}` };
        const value = numeric(row[col]);
        if (value !== undefined)
          return { amount: value, cell: `${columnName(col)}${index + 1}` };
      }
    }
    return { amount: null, cell: null };
  }
  const cash = labelledNumber(/^CASH ON HAND:?$/i),
    unliquidated = labelledNumber(
      /^(UNLIQUIDATED(?: VOUCHER)?|OUTSTANDING(?: ADVANCES?)?):?$/i,
    );
  const round = (value: number) => Math.round(value * 100) / 100;
  const printedTotal = numeric(grid[boundary]?.[outgoing]);
  return {
    opening_balance: opening,
    inflows: round(inflows),
    outflows: round(outflows),
    ledger_balance: closing,
    cash_on_hand: cash.amount,
    unliquidated: unliquidated.amount,
    expense_rows: expenseRows,
    balance_cell: balanceCell,
    cash_cell: cash.cell,
    formula_errors: grid.reduce(
      (count, row) =>
        count +
        row.filter((cell) =>
          /^#(REF!|VALUE!|DIV\/0!|N\/A|ERROR!)/.test(text(cell)),
        ).length,
      0,
    ),
    balanced:
      printedTotal === undefined
        ? null
        : Math.abs(round(outflows) - round(printedTotal)) < 0.01,
  };
}

// Why a snapshot cannot be used, in words a person can act on; null when it is fine. The cells are named so
// the sheet can be fixed.
export function ledgerProblem(grid: Cell[][], summary: LedgerSummary | null): string | null {
  if (!summary) return "The snapshot has no readable ledger: a header row with DATE, OUT and BALANCE and at least one amount is needed.";
  if (summary.formula_errors > 0) {
    const cells: string[] = [];
    grid.forEach((row, rowIndex) =>
      row.forEach((cell, columnIndex) => {
        if (/^#(REF!|VALUE!|DIV\/0!|N\/A|ERROR!)/.test(text(cell)) && cells.length < 5) cells.push(`${columnName(columnIndex)}${rowIndex + 1}`);
      }),
    );
    return `The sheet shows formula errors (${cells.join(", ")}${summary.formula_errors > cells.length ? ", ..." : ""}). Fix them, then the next read will be accepted.`;
  }
  if (summary.balanced === false)
    return `The OUT total printed in the sheet does not match the expense rows above it (rows add up to ${summary.outflows.toFixed(2)}). Check for a total that stops early or a row typed outside the ledger.`;
  return null;
}
