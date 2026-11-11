import { expect, it } from "vitest";
import {
  GROKBOT_BUYING_TARGET,
  grokbotFinancialEvent,
} from "@/lib/grokbot/contract";
const id = "91000000-0000-4000-8000-000000000001";
const entry = {
  entry_id: id,
  particulars: "Fuel",
  amount: "450.00",
  tag: "CE - FUEL",
  expense_date: "2026-11-11",
  supplier: "",
  tin: "",
  receipt_number: "",
  plate: "",
};
const liquidation = {
  protocol_version: "pcf.grokbot.v1",
  operation_id: id,
  target: GROKBOT_BUYING_TARGET,
  event: "pcf.liquidation.approved",
  liquidation_id: id,
  voucher_id: id,
  voucher_number: "0001",
  requester_name: "Test Employee",
  department: "Operations",
  filing_date: "2026-11-11",
  custodian_approved_at: "2026-11-11T01:00:00Z",
  custodian_id: id,
  amount_received: "500.00",
  total_spent: "450.00",
  return_amount: "50.00",
  reimbursement_amount: "0.00",
  lines: [entry],
};
it("validates change, reimbursement, and zero-spend liquidations", () => {
  expect(grokbotFinancialEvent.safeParse(liquidation).success).toBe(true);
  expect(
    grokbotFinancialEvent.safeParse({
      ...liquidation,
      total_spent: "650.00",
      return_amount: "0.00",
      reimbursement_amount: "150.00",
      lines: [{ ...entry, amount: "650.00" }],
    }).success,
  ).toBe(true);
  expect(
    grokbotFinancialEvent.safeParse({
      ...liquidation,
      total_spent: "0.00",
      return_amount: "500.00",
      lines: [],
    }).success,
  ).toBe(true);
});
it("normalizes Supabase offset approval timestamps to UTC", () => {
  const parsed = grokbotFinancialEvent.parse({
    ...liquidation,
    custodian_approved_at: "2026-11-11T16:39:12.123456+08:00",
  });
  expect(parsed.event === "pcf.liquidation.approved" && parsed.custodian_approved_at)
    .toBe("2026-11-11T08:39:12.123Z");
  expect(grokbotFinancialEvent.safeParse({
    ...liquidation, custodian_approved_at: "2026-11-11T08:39:12.123456+00:00",
  }).success).toBe(true);
  expect(grokbotFinancialEvent.safeParse({
    ...liquidation, custodian_approved_at: "2026-11-11T08:39:12",
  }).success).toBe(false);
});
it("rejects wrong destinations, duplicate entries, and inconsistent totals", () => {
  expect(
    grokbotFinancialEvent.safeParse({
      ...liquidation,
      target: { ...GROKBOT_BUYING_TARGET, sheet_id: 0 },
    }).success,
  ).toBe(false);
  expect(
    grokbotFinancialEvent.safeParse({ ...liquidation, lines: [entry, entry] })
      .success,
  ).toBe(false);
  expect(
    grokbotFinancialEvent.safeParse({ ...liquidation, return_amount: "100.00" })
      .success,
  ).toBe(false);
});
it("requires independent dual approval and the next replenishment number", () => {
  const replenishment = {
    protocol_version: "pcf.grokbot.v1",
    operation_id: id,
    target: GROKBOT_BUYING_TARGET,
    event: "pcf.replenishment.approved",
    replenishment_id: id,
    replenishment_number: 1,
    expected_previous_replenishment_number: 0,
    approved_amount: "1000.00",
    accounting_approved_at: "2026-11-11T01:00:00Z",
    approver_approved_at: "2026-11-11T02:00:00Z",
    accounting_id: id,
    approver_id: "91000000-0000-4000-8000-000000000002",
    custodian_name: "Test Custodian",
    approval_date: "2026-11-11",
  };
  expect(grokbotFinancialEvent.safeParse(replenishment).success).toBe(true);
  expect(
    grokbotFinancialEvent.safeParse({
      ...replenishment,
      replenishment_number: 12,
    }).success,
  ).toBe(false);
  expect(
    grokbotFinancialEvent.safeParse({ ...replenishment, approver_id: id })
      .success,
  ).toBe(false);
});
