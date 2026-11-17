import { describe, expect, it } from "vitest";

import { buildSettlementItems, settlementAction, settlementTotals, type ApprovedLiquidation } from "@/lib/settlements-core";

const liq = (id: string, received: number, spent: number, reviewed: string): ApprovedLiquidation => ({
  id, pcv_number: `PCV-${id}`, employee_name: `Person ${id}`, fund_name: "Buying", amount_received: received, total_spent: spent,
  reviewed_at: reviewed, owner_id: `o-${id}`, fund_id: "f",
});

describe("cash settlements still to do", () => {
  const items = buildSettlementItems({
    liquidations: [liq("2", 1000, 400, "2026-11-15T01:00:00Z"), liq("1", 2500, 4315, "2026-11-10T01:00:00Z"), liq("3", 500, 500, "2026-11-11T01:00:00Z"), liq("4", 900, 100, "2026-11-12T01:00:00Z")],
    settledLiquidationIds: ["4"],
    cancelled: [{ voucher_id: "v9", pcv_number: "PCV-9", payee: "Karen", fund_name: "Buying", amount: 1000, cancelled_at: "2026-11-16T01:00:00Z", canAct: false }],
    canActOn: (row) => row.id !== "2",
  });

  it("skips the settled and the exact ones, and orders the longest waiting first", () => {
    expect(items.map((item) => item.key)).toEqual(["l-1", "l-2", "c-v9"]);
  });
  it("tells change to take back from a reimbursement to pay, and an unused advance", () => {
    expect(items.map((item) => [item.kind, item.amount])).toEqual([["reimbursement", 1815], ["return", 600], ["cancelled", 1000]]);
    expect(settlementAction(items[0])).toBe("Pay Person 1 the reimbursement");
    expect(settlementAction(items[1])).toBe("Take the change back from Person 2");
    expect(settlementAction(items[2])).toBe("Take the unused advance back from Karen");
  });
  it("marks the ones this person cannot record", () => {
    expect(items.map((item) => item.canAct)).toEqual([true, false, false]);
  });
  it("totals what to take back and what to pay", () => {
    expect(settlementTotals(items)).toEqual({ toCollect: 1600, toPay: 1815 });
  });
});
