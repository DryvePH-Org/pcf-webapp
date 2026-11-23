import { describe, expect, it } from "vitest";

import { describeScope } from "@/lib/replenishment-scope";

const base = {
  voucherCount: 23, entryCount: 69, firstPcv: "0001", lastPcv: "0022", firstDate: "2026-07-15", lastDate: "2026-11-19",
  preparedOn: "2026-11-20", total: "32573.00", later: { count: 5, amount: "5112.00" },
};

describe("what a replenishment report says it covers", () => {
  it("names the vouchers, the dates and the day it was prepared", () => {
    const scope = describeScope(base);
    expect(scope.covers).toContain("69 expenses on 23 vouchers");
    expect(scope.covers).toContain("0001 to 0022");
    expect(scope.covers).toContain("Jul 15, 2026 to Nov 19, 2026");
    expect(scope.covers).toContain("prepared on Nov 20, 2026");
    expect(scope.total).toBe("₱32,573.00 is the amount this replenishment replaces.");
  });

  it("says that later expenses belong to the next replenishment, and that the sheet and Accounting count more", () => {
    const scope = describeScope(base);
    expect(scope.later).toContain("5 liquidations totalling ₱5,112.00");
    expect(scope.later).toContain("next replenishment");
    expect(scope.note).toMatch(/Google Sheet and the Accounting page count everything/);
  });

  it("stays silent about later expenses when there are none, and uses the singular", () => {
    const scope = describeScope({ ...base, later: null, voucherCount: 1, entryCount: 1, firstPcv: "0007", lastPcv: "0007", firstDate: "2026-11-12", lastDate: "2026-11-12" });
    expect(scope.later).toBeNull();
    expect(scope.covers).toContain("1 expense on 1 voucher (0007, dated Nov 12, 2026)");
  });
});
