import { expect, it } from "vitest";
import { validateFinancialResult } from "@/lib/grokbot/results";
import { GROKBOT_BUYING_TARGET } from "@/lib/grokbot/contract";
const checks = Object.fromEntries(
  [
    "amounts",
    "dates",
    "numbering",
    "running_balance",
    "summary_formulas",
    "input_vat_preserved",
    "write_scope",
    "duplicate_free",
  ].map((name) => [name, true]),
);
const report = {
  verified: true,
  editor_account: "admin.manilaautodisplay@gmail.com",
  spreadsheet_id: GROKBOT_BUYING_TARGET.spreadsheet_id,
  sheet_id: GROKBOT_BUYING_TARGET.sheet_id,
  audit_tab_id: 2133354940,
  audit_rows: "A3:V5",
  checks,
  before_balance: "40000.00",
  after_balance: "39800.00",
  in_amount: "0.00",
  out_amount: "200.00",
  rows_written: 2,
};
const liquidation = {
  event: "pcf.liquidation.approved",
  total_spent: "200.00",
  lines: [{}, {}],
};
it("requires reconciled amounts, audit evidence, correct editor and every verification check", () => {
  expect(validateFinancialResult(liquidation, report)).toBe(true);
  for (const change of [
    { after_balance: "39900.00" },
    { out_amount: "100.00" },
    { rows_written: 1 },
    { editor_account: "another@example.com" },
    { sheet_id: 1 },
    { audit_rows: "" },
    { audit_tab_id: "2133354940" },
    { audit_tab_id: 0 },
    { audit_tab_id: GROKBOT_BUYING_TARGET.sheet_id },
    { checks: { ...checks, input_vat_preserved: false } },
  ])
    expect(validateFinancialResult(liquidation, { ...report, ...change })).toBe(
      false,
    );
});
it("accepts a recreated audit tab with a new numeric ID", () => {
  expect(validateFinancialResult(liquidation, { ...report, audit_tab_id: 987654321 })).toBe(true);
});
it("requires the approved replenishment number and green marker read-back", () => {
  const payload = {
    event: "pcf.replenishment.approved",
    approved_amount: "1000.00",
    replenishment_number: 1,
  };
  const replenishment = {
    ...report,
    after_balance: "41000.00",
    in_amount: "1000.00",
    out_amount: "0.00",
    rows_written: 1,
    replenishment_number: 1,
    checks: { ...checks, green_marker: true },
  };
  expect(validateFinancialResult(payload, replenishment)).toBe(true);
  expect(
    validateFinancialResult(payload, {
      ...replenishment,
      replenishment_number: 12,
    }),
  ).toBe(false);
  expect(validateFinancialResult(payload, { ...replenishment, checks })).toBe(
    false,
  );
});
it("requires restored ledger evidence for a webapp simulation", () => {
  const simulation = {
    ...report,
    rows_written: 3,
    replenishment_number: 1,
    in_amount: "1000.00",
    after_balance: "40800.00",
    restored: true,
    restored_balance: "40000.00",
  };
  expect(
    validateFinancialResult({ source: "webapp-simulation" }, simulation),
  ).toBe(true);
  expect(
    validateFinancialResult(
      { source: "webapp-simulation" },
      { ...simulation, restored: false },
    ),
  ).toBe(false);
});
