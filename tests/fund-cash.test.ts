import { describe, expect, it } from "vitest";

import { cashAfterSettlements } from "@/lib/fund-cash";

describe("fund cash after pending settlements", () => {
  it("matches the recorded cash when nothing is pending", () => {
    expect(cashAfterSettlements({ expected_cash: 27521 })).toEqual({
      recorded: 27521, returnsDue: 0, reimbursementsDue: 0, afterSettlements: 27521, pending: false,
    });
  });

  it("takes off a reimbursement that is owed but not yet recorded as paid", () => {
    // e.g. an employee spent ₱1,704 more than the advance and the custodian has not recorded paying it yet
    expect(cashAfterSettlements({ expected_cash: 29225, returns_due: 0, reimbursements_due: 1704 })).toMatchObject({
      afterSettlements: 27521, pending: true,
    });
  });

  it("adds change that should come back but is not yet recorded", () => {
    expect(cashAfterSettlements({ expected_cash: 49000, returns_due: 350 })).toMatchObject({ afterSettlements: 49350, pending: true });
  });

  it("combines both and keeps exact centavos", () => {
    const result = cashAfterSettlements({ expected_cash: 100.1, returns_due: 0.2, reimbursements_due: 0.1 });
    expect(result.afterSettlements).toBe(100.2);
  });
});
