import type { Cell } from "./types";
const text = (cell?: Cell) =>
  String(cell?.userEnteredValue?.stringValue ?? cell?.formattedValue ?? "")
    .trim()
    .toUpperCase();
/** The cash-ledger subtotal can be unlabeled (Dryve) or use a singular label.
 * Prefer its self-bounded SUM in OUT over a later cash-on-hand summary label.
 */
export function findLedgerBoundary(
  grid: Cell[][],
  header: number,
  out: number,
): number {
  let letter = "";
  for (let n = out + 1; n > 0; n = Math.floor((n - 1) / 26))
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  const subtotal = grid.findIndex((row, index) => {
    if (index <= header + 2) return false;
    const formula = row[out]?.userEnteredValue?.formulaValue?.replace(
      /\$/g,
      "",
    );
    const match = formula?.match(/^=?SUM\(([A-Z]+)(\d+):\1(\d+)\)$/i);
    return Boolean(
      match &&
        match[1].toUpperCase() === letter &&
        Number(match[3]) === index &&
        Number(match[2]) > header + 1,
    );
  });
  if (subtotal >= 0) return subtotal;
  const labelled = grid.findIndex(
    (row, index) =>
      index > header &&
      row.some((cell) => /^TOTAL DISBURSEMENTS?$/.test(text(cell))),
  );
  if (labelled >= 0) return labelled;
  return grid.findIndex(
    (row, index) =>
      index > header &&
      row.some((cell) => /^(PREPARED|CHECKED|APPROVED) BY:?$/.test(text(cell))),
  );
}

/** Account-summary formulas also include tags with no historical expenses yet. */
export function sheetExpenseTags(grid: Cell[][]): string[] {
  const tags = new Set<string>();
  for (const row of grid) {
    for (const cell of row) {
      const formula = cell?.userEnteredValue?.formulaValue ?? "";
      for (const match of formula.matchAll(/SUMIF\([^,]+,\s*"([^"]+)"/gi))
        tags.add(match[1]);
    }
  }
  return [...tags].sort();
}
