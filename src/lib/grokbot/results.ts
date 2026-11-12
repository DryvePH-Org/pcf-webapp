import { z } from "zod";
import { GROKBOT_BUYING_TARGET } from "./contract";
import { parseMoney } from "@/lib/money";

const value = z.object({
  stringValue: z.string().max(10000).optional(),
  numberValue: z.number().finite().optional(),
  formulaValue: z.string().max(10000).optional(),
});
export const buyingSnapshotSchema = z.object({
  spreadsheet_id: z.literal(GROKBOT_BUYING_TARGET.spreadsheet_id),
  sheet_id: z.literal(GROKBOT_BUYING_TARGET.sheet_id),
  sheet_title: z.literal(GROKBOT_BUYING_TARGET.sheet_title),
  grid: z
    .array(
      z
        .array(
          z.object({
            userEnteredValue: value.optional(),
            effectiveValue: value.optional(),
            formattedValue: z.string().max(10000).optional(),
          }),
        )
        .max(30),
    )
    .min(89)
    .max(1000),
});

export function validateFinancialResult(
  payload: Record<string, unknown>,
  report: Record<string, unknown>,
) {
  const checks = report.checks as Record<string, unknown> | undefined;
  const required = [
    "amounts",
    "dates",
    "numbering",
    "running_balance",
    "summary_formulas",
    "input_vat_preserved",
    "write_scope",
    "duplicate_free",
  ];
  if (
    report.verified !== true ||
    report.editor_account !== "admin.manilaautodisplay@gmail.com" ||
    report.spreadsheet_id !== GROKBOT_BUYING_TARGET.spreadsheet_id ||
    report.sheet_id !== GROKBOT_BUYING_TARGET.sheet_id ||
    // Staff may delete the audit tab; the routine then recreates it with a new ID.
    typeof report.audit_tab_id !== "number" ||
    !Number.isSafeInteger(report.audit_tab_id) ||
    report.audit_tab_id <= 0 ||
    report.audit_tab_id === GROKBOT_BUYING_TARGET.sheet_id ||
    typeof report.audit_rows !== "string" ||
    !/^A\d+:V\d+$/.test(report.audit_rows) ||
    required.some((key) => checks?.[key] !== true)
  )
    return false;
  if (payload.source === "webapp-simulation")
    return (
      report.restored === true &&
      report.rows_written === 3 &&
      report.replenishment_number === 1 &&
      parseMoney(String(report.in_amount)) === 100000 &&
      parseMoney(String(report.out_amount)) === 20000 &&
      parseMoney(String(report.before_balance)) === 4000000 &&
      parseMoney(String(report.after_balance)) === 4080000 &&
      parseMoney(String(report.restored_balance)) === 4000000
    );
  const incoming = parseMoney(String(report.in_amount));
  const outgoing = parseMoney(String(report.out_amount));
  const before = signedMoney(report.before_balance);
  const after = signedMoney(report.after_balance);
  if (
    incoming === null ||
    outgoing === null ||
    before === null ||
    after === null ||
    after !== before + incoming - outgoing
  )
    return false;
  if (payload.event === "pcf.liquidation.approved")
    return (
      incoming === 0 &&
      outgoing === parseMoney(String(payload.total_spent)) &&
      report.rows_written === (payload.lines as unknown[]).length
    );
  return (
    outgoing === 0 &&
    incoming === parseMoney(String(payload.approved_amount)) &&
    report.rows_written === 1 &&
    report.replenishment_number === payload.replenishment_number &&
    checks?.green_marker === true
  );
}

function signedMoney(value: unknown) {
  if (typeof value !== "string") return null;
  const negative = value.startsWith("-");
  const cents = parseMoney(negative ? value.slice(1) : value);
  return cents === null ? null : negative ? -cents : cents;
}
