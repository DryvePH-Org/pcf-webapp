import { describe, expect, it } from "vitest";
import { liquidationDifference } from "@/lib/liquidation";
import { saveLiquidationSchema, submitLiquidationSchema, liquidationReviewSchema, settlementSchema } from "@/lib/validators/liquidation";
import { ALL_ROLES, canAccessRoute } from "@/lib/permissions";
const id = "90000000-0000-4000-8000-000000000001";
const form = { id, department: "Operations", filing_date: "2026-11-06", unspent_reason: "", items: [{ id, particulars: "Supplies", amount: "1700.00", category_id: id, receipt_path: "", no_receipt_reason: "Vendor did not issue a receipt" }] };
describe("liquidation money", () => {
  it.each([
    ["2000", "1700", "return", "300.00"],
    ["2000", "2300", "reimbursement", "300.00"],
    ["2000", "2000", "none", "0.00"],
    ["2000", "0", "return", "2000.00"],
    ["0.50", "0.20", "return", "0.30"],
    ["0.20", "0.50", "reimbursement", "0.30"],
  ])("calculates %s received versus %s spent", (received, spent, kind, amount) => {
    expect(liquidationDifference(received, spent)).toMatchObject({ kind, amount });
  });
  it("rejects malformed money", () => { expect(() => liquidationDifference("oops", "100")).toThrow(); });
});
describe("liquidation validation", () => {
  it("accepts a valid form with receipt explanations", () => { expect(submitLiquidationSchema.safeParse(form).success).toBe(true); });
  it("permits draft lines without proofs but requires them at submission", () => {
    const draft = { ...form, items: [{ ...form.items[0], no_receipt_reason: "" }] };
    expect(saveLiquidationSchema.safeParse(draft).success).toBe(true);
    expect(submitLiquidationSchema.safeParse(draft).success).toBe(false);
  });
  it("accepts a stored attachment without a missing-receipt explanation", () => {
    expect(submitLiquidationSchema.safeParse({ ...form, items: [{ ...form.items[0], receipt_path: `${id}/${id}/receipt.pdf`, no_receipt_reason: "" }] }).success).toBe(true);
  });
  it("requires an explanation for a fully unused advance", () => {
    expect(submitLiquidationSchema.safeParse({ ...form, items: [] }).success).toBe(false);
    expect(submitLiquidationSchema.safeParse({ ...form, items: [], unspent_reason: "Purchase cancelled" }).success).toBe(true);
  });
  it.each(["0", "-1", "1.001", "NaN", "Infinity"])("rejects invalid line amount %s", amount => { expect(saveLiquidationSchema.safeParse({ ...form, items: [{ ...form.items[0], amount }] }).success).toBe(false); });
  it("rejects more than 20 lines and an overlarge total", () => {
    expect(saveLiquidationSchema.safeParse({ ...form, items: Array(21).fill(form.items[0]) }).success).toBe(false);
    expect(saveLiquidationSchema.safeParse({ ...form, items: [form.items[0], form.items[0]].map(item => ({ ...item, amount: "9999999999.99" })) }).success).toBe(false);
  });
  it("validates dates and departments", () => {
    expect(saveLiquidationSchema.safeParse({ ...form, filing_date: "2026-02-30" }).success).toBe(false);
    expect(saveLiquidationSchema.safeParse({ ...form, department: " " }).success).toBe(false);
  });
  it("requires a reason to flag and a positive settlement amount", () => {
    expect(liquidationReviewSchema.safeParse({ id, approve: false, note: " " }).success).toBe(false);
    expect(liquidationReviewSchema.safeParse({ id, approve: true }).success).toBe(true);
    expect(settlementSchema.safeParse({ id, amount: "0" }).success).toBe(false);
  });
  it("makes the liquidation area available to every role", () => {
    for (const role of ALL_ROLES) expect(canAccessRoute(role, "/liquidations")).toBe(true);
  });
});
