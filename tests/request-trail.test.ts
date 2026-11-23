import { describe, expect, it } from "vitest";

import { buildRequestTrail, stageLabel, type TrailInput } from "@/lib/request-trail";

const base: TrailInput = {
  request: { id: "r1", ref: "BR-1C76EED3", status: "voucher_created" },
  voucher: { id: "v1", pcv: "PCV-2026-0001", status: "released", released: true },
  liquidation: { id: "l1", status: "approved", received: "900.00", spent: "770.50" },
  settlement: null,
};
const states = (input: TrailInput, here: Parameters<typeof buildRequestTrail>[1] = "request") => buildRequestTrail(input, here).map(step => step.state);

describe("the request trail", () => {
  it("always has the four steps in order", () => {
    expect(buildRequestTrail(base, "request").map(step => step.key)).toEqual(["request", "voucher", "liquidation", "settlement"]);
  });

  it("a request waiting for review: everything after it is still to come and cannot be opened", () => {
    const steps = buildRequestTrail({ request: { id: "r1", ref: "BR-1", status: "submitted" }, voucher: null, liquidation: null, settlement: null }, "request");
    expect(steps.map(step => step.state)).toEqual(["waiting", "todo", "todo", "todo"]);
    expect(steps.map(step => step.href)).toEqual(["/requests/r1", null, null, null]);
    expect(steps[0].detail).toBe("Awaiting review");
  });

  it("an approved request is waiting for its voucher", () => {
    const steps = buildRequestTrail({ request: { id: "r1", ref: "BR-1C76EED3", status: "approved" }, voucher: null, liquidation: null, settlement: null }, "request");
    expect(steps[0].state).toBe("done");
    expect(steps[1].detail).toBe("To be prepared");
  });

  it("cash released and nothing filed yet: the liquidation is the next thing to do", () => {
    const steps = buildRequestTrail({ ...base, liquidation: null }, "voucher");
    expect(steps.map(step => step.state)).toEqual(["done", "done", "waiting", "todo"]);
    expect(steps[2].detail).toBe("Not filed yet");
    expect(steps[1].current).toBe(true);
  });

  it("a flagged liquidation shows as stopped and can still be opened", () => {
    const steps = buildRequestTrail({ ...base, liquidation: { id: "l1", status: "flagged", received: "900.00", spent: "900.00" } }, "liquidation");
    expect(steps[2]).toMatchObject({ state: "stopped", detail: "Needs correction", href: "/liquidations/l1", current: true });
    expect(steps[3].state).toBe("todo");
  });

  it("an approved liquidation with cash to return waits for the settlement, which links into the liquidation page", () => {
    const steps = buildRequestTrail(base, "liquidation");
    expect(steps[3]).toMatchObject({ state: "waiting", detail: "Cash to return ₱129.50", href: "/liquidations/l1#settlement" });
  });

  it("a recorded settlement completes the trail; a balanced liquidation has nothing to settle", () => {
    const settled = buildRequestTrail({ ...base, settlement: { kind: "return", amount: "129.50" } }, "settlement");
    expect(settled.map(step => step.state)).toEqual(["done", "done", "done", "done"]);
    expect(settled[3]).toMatchObject({ detail: "Cash returned ₱129.50", current: true });
    const balanced = buildRequestTrail({ ...base, liquidation: { id: "l1", status: "approved", received: "900.00", spent: "900.00" } }, "liquidation");
    expect(balanced[3]).toMatchObject({ state: "done", detail: "Nothing to settle" });
  });

  it("reimbursement is described as owed to the employee, and paid once recorded", () => {
    const owed = buildRequestTrail({ ...base, liquidation: { id: "l1", status: "approved", received: "500.00", spent: "650.00" } }, "liquidation");
    expect(owed[3].detail).toBe("Reimbursement due ₱150.00");
    const paid = buildRequestTrail({ ...base, liquidation: { id: "l1", status: "approved", received: "500.00", spent: "650.00" }, settlement: { kind: "reimbursement", amount: "150.00" } }, "liquidation");
    expect(paid[3]).toMatchObject({ state: "done", detail: "Reimbursed ₱150.00" });
  });

  it("a voucher made directly has no request step to open, and a stopped voucher shows why", () => {
    expect(states({ ...base, request: null }).length).toBe(3);
    const void_ = buildRequestTrail({ ...base, voucher: { id: "v1", pcv: "PCV-1", status: "void", released: false }, liquidation: null }, "voucher");
    expect(void_[1]).toMatchObject({ state: "stopped", detail: "Void" });
    const cancelled = buildRequestTrail({ request: { id: "r1", ref: "BR-1", status: "cancelled" }, voucher: null, liquidation: null, settlement: null }, "request");
    expect(cancelled[0]).toMatchObject({ state: "stopped", detail: "Cancelled" });
  });
});

describe("the stage of a whole trail, in one line for a list", () => {
  it("names the first step that is not done yet", () => {
    expect(stageLabel(buildRequestTrail({ request: { id: "r1", ref: "BR-1", status: "submitted" }, voucher: null, liquidation: null, settlement: null }, "request"))).toBe("Budget request: Awaiting review");
    expect(stageLabel(buildRequestTrail({ ...base, liquidation: null }, "voucher"))).toBe("Liquidation: Not filed yet");
    expect(stageLabel(buildRequestTrail({ ...base, liquidation: { id: "l1", status: "submitted", received: "900.00", spent: "900.00" } }, "liquidation"))).toBe("Liquidation: Awaiting custodian review");
    expect(stageLabel(buildRequestTrail(base, "liquidation"))).toBe("Settlement: Cash to return ₱129.50");
    expect(stageLabel(buildRequestTrail({ ...base, settlement: { kind: "return", amount: "129.50" } }, "settlement"))).toBe("Everything settled");
  });
});
