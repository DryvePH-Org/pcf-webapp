import { describe, expect, it } from "vitest";

import { buildMoneyTrail } from "@/lib/money-trail";
import { cashAfterSettlements } from "@/lib/fund-cash";

// The real Buying fund on 17 Nov 2026: the app said P27,635 and the sheet said P26,820.
const vouchers = [
  { id: "v1", pcv_number: "PCV-2026-0001", payee: "Aaron", amount: 1400 },
  { id: "v2", pcv_number: "PCV-2026-0002", payee: "Camila Leanda", amount: 3000 },
  { id: "v3", pcv_number: "PCV-2026-0003", payee: "Camila Leanda", amount: 1400 },
  { id: "v4", pcv_number: "PCV-2026-0004", payee: "Camila Leanda", amount: 2000 },
  { id: "v5", pcv_number: "PCV-2026-0005", payee: "Justine Cuyos", amount: 1948 },
  { id: "v6", pcv_number: "PCV-2026-0006", payee: "Karen Mae Acosta", amount: 2500 },
  { id: "v9", pcv_number: "PCV-2026-0009", payee: "Justine Cuyos", amount: 650 },
  { id: "v10", pcv_number: "PCV-2026-0010", payee: "Karen Mae Acosta", amount: 1000 },
  { id: "v11", pcv_number: "PCV-2026-0011", payee: "Justine Cuyos", amount: 800 },
];
const approved = (voucher_id: string, total_spent: number) => ({ voucher_id, status: "approved", total_spent });
const liquidations = [
  approved("v1", 1400), approved("v2", 597), approved("v3", 2329), approved("v4", 1778),
  approved("v5", 1948), approved("v6", 4315), approved("v9", 112), approved("v11", 701),
];
const settlements = [
  { voucher_id: "v2", kind: "return" as const, amount: 2403 },
  { voucher_id: "v3", kind: "reimbursement" as const, amount: 929 },
  { voucher_id: "v4", kind: "return" as const, amount: 222 },
  { voucher_id: "v9", kind: "return" as const, amount: 538 },
  { voucher_id: "v11", kind: "return" as const, amount: 99 },
];

describe("where the money is (the real Buying case)", () => {
  const trail = buildMoneyTrail({ fundAmount: 40000, vouchers, liquidations, settlements, sheet: { balance: 26820, syncedAt: "2026-11-17T01:00:00Z" } });

  it("reproduces the app's recorded cash and the sheet's balance exactly", () => {
    expect(trail.recordedCash).toBe(27635);
    expect(trail.spent).toBe(13180);
    expect(trail.sheetShouldShow).toBe(26820);
    expect(trail.cashAfterSettlements).toBe(25820);
    expect(trail.sheetUnexplained).toBe(0);
  });

  it("points at the two vouchers that explain the P815", () => {
    expect(trail.difference).toBe(815);
    expect(trail.owedToEmployees).toEqual([{ who: "Karen Mae Acosta", ref: "PCV-2026-0006", amount: 1815 }]);
    expect(trail.notLiquidated).toEqual([{ who: "Karen Mae Acosta", ref: "PCV-2026-0010", amount: 1000 }]);
    expect(trail.changeToCollect).toEqual([]);
    const signed = trail.reasons.reduce((total, reason) => total + reason.sign * reason.amount, 0);
    expect(signed).toBe(trail.difference);
  });

  it("agrees with the dashboard's cash-after-settlements figure", () => {
    const view = cashAfterSettlements({ expected_cash: 27635, returns_due: 0, reimbursements_due: 1815 });
    expect(view.afterSettlements).toBe(trail.cashAfterSettlements);
  });
});

describe("other situations", () => {
  it("shows no difference when everything is settled and written", () => {
    const trail = buildMoneyTrail({
      fundAmount: 1000, vouchers: [{ id: "a", pcv_number: "PCV-1", payee: "Ana", amount: 300 }],
      liquidations: [approved("a", 200)], settlements: [{ voucher_id: "a", kind: "return", amount: 100 }],
      sheet: { balance: 800, syncedAt: null },
    });
    expect(trail).toMatchObject({ recordedCash: 800, sheetShouldShow: 800, difference: 0, sheetUnexplained: 0, reasons: [] });
  });

  it("counts change still to come back as cash that is not in the box yet", () => {
    const trail = buildMoneyTrail({
      fundAmount: 1000, vouchers: [{ id: "a", pcv_number: "PCV-1", payee: "Ana", amount: 300 }],
      liquidations: [approved("a", 200)], settlements: [],
    });
    expect(trail.changeToCollect).toEqual([{ who: "Ana", ref: "PCV-1", amount: 100 }]);
    expect(trail.recordedCash).toBe(700);
    expect(trail.cashAfterSettlements).toBe(800);
    expect(trail.difference).toBe(-100);
  });

  it("explains an approved liquidation that has not reached the sheet yet", () => {
    const trail = buildMoneyTrail({
      fundAmount: 1000, vouchers: [{ id: "a", pcv_number: "PCV-1", payee: "Ana", amount: 300 }],
      liquidations: [approved("a", 300)], settlements: [], notInSheetVoucherIds: ["a"],
      sheet: { balance: 1000, syncedAt: null },
    });
    expect(trail.notInSheet).toEqual([{ who: "Ana", ref: "PCV-1", amount: 300 }]);
    expect(trail.sheetUnexplained).toBe(0);
    expect(trail.difference).toBe(-300);
  });

  it("flags a sheet balance the app cannot explain, such as a typed entry", () => {
    const trail = buildMoneyTrail({
      fundAmount: 1000, vouchers: [{ id: "a", pcv_number: "PCV-1", payee: "Ana", amount: 300 }],
      liquidations: [approved("a", 300)], settlements: [], sheet: { balance: 650, syncedAt: null },
    });
    expect(trail.sheetUnexplained).toBe(-50);
  });

  it("works in centavos without drifting", () => {
    const trail = buildMoneyTrail({
      fundAmount: 100.1, vouchers: [{ id: "a", pcv_number: "PCV-1", payee: "Ana", amount: 0.3 }],
      liquidations: [approved("a", 0.2)], settlements: [{ voucher_id: "a", kind: "return", amount: 0.1 }],
    });
    expect(trail.recordedCash).toBe(99.9);
  });
});

describe("a cancelled advance whose cash is not back yet", () => {
  // Worked as "nothing spent, all of it still to come back", exactly as the loader feeds it.
  const cancelled = { id: "vx", pcv_number: "PCV-2026-0099", payee: "Employee", amount: 1000 };
  const trail = buildMoneyTrail({
    fundAmount: 10000,
    vouchers: [cancelled],
    liquidations: [{ voucher_id: "vx", status: "approved", total_spent: 0 }],
    settlements: [],
    sheet: { balance: 10000, syncedAt: null },
  });

  it("keeps the cash as out in the app but never in the sheet", () => {
    expect(trail.recordedCash).toBe(9000);
    expect(trail.cashAfterSettlements).toBe(10000);
    expect(trail.sheetShouldShow).toBe(10000);
    expect(trail.sheetUnexplained).toBe(0);
    expect(trail.spent).toBe(0);
  });

  it("names the person and the voucher as cash still to come back", () => {
    expect(trail.changeToCollect).toEqual([{ who: "Employee", ref: "PCV-2026-0099", amount: 1000 }]);
    expect(trail.notLiquidated).toEqual([]);
    expect(trail.difference).toBe(-1000);
  });
});
