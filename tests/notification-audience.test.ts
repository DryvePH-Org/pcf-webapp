import { describe, expect, it } from "vitest";

import { emptyStats, fundsInScope, mergeStats } from "@/lib/notifications/digest";
import { audienceFor } from "@/lib/notifications/routing";

const people = { custodians: ["c1", "c2"], approvers: ["a1"] };
const noApprover = { custodians: ["c1"], approvers: [] as string[] };

describe("who is told: the people of that fund, never a whole role", () => {
  it("a voucher or liquidation that needs an approver goes to the fund's approvers, an administrator only when it has none", () => {
    expect(audienceFor("needs_approval", people)).toEqual({ roles: [], include: ["a1"] });
    expect(audienceFor("needs_approval", noApprover)).toEqual({ roles: ["admin"], include: [] });
  });

  it("cash released waits for the fund's approver only", () => {
    expect(audienceFor("voucher_released", people)).toEqual({ roles: [], include: ["a1"] });
    expect(audienceFor("voucher_released", noApprover)).toEqual({ roles: [], include: [] });
  });

  it("a flagged or voided voucher reaches its preparer and the fund's custodians and approver, with no administrators", () => {
    const audience = audienceFor("stopped", people, ["preparer", "c1"]);
    expect(audience.roles).toEqual([]);
    expect(audience.include.sort()).toEqual(["a1", "c1", "c2", "preparer"]);
  });

  it("a replenishment waiting for the approver goes to that fund's approver and the requester", () => {
    expect(audienceFor("replenishment_awaits_approver", people, ["requester"])).toEqual({ roles: [], include: ["a1", "requester"] });
    expect(audienceFor("replenishment_awaits_approver", noApprover, ["requester"])).toEqual({ roles: ["admin"], include: ["requester"] });
  });

  it("a rejected or closed replenishment reaches its requester and the fund's custodians", () => {
    expect(audienceFor("replenishment_stopped", people, ["requester"])).toEqual({ roles: [], include: ["requester", "c1", "c2"] });
  });

  it("a low balance goes to the fund's custodians and to accounting, who replenish; an administrator only if nobody holds the fund", () => {
    expect(audienceFor("low_balance", people)).toEqual({ roles: ["accounting"], include: ["c1", "c2"] });
    expect(audienceFor("low_balance", { custodians: [], approvers: [] })).toEqual({ roles: ["accounting", "admin"], include: [] });
  });
});

describe("the daily summary counts only a person's own funds", () => {
  const funds = new Map([
    ["f1", { custodians: ["c1"], approvers: ["a1"] }],
    ["f2", { custodians: ["c2"], approvers: ["a2"] }],
  ]);
  it("a custodian and an approver see their own funds; accounting and administrators see all", () => {
    expect(fundsInScope("custodian", "c1", funds)).toEqual(["f1"]);
    expect(fundsInScope("approver", "a2", funds)).toEqual(["f2"]);
    expect(fundsInScope("accounting", "x", funds)).toBe("all");
    expect(fundsInScope("admin", "x", funds)).toBe("all");
    expect(fundsInScope("custodian", "nobody", funds)).toEqual([]);
  });

  it("another fund's vouchers do not reach someone who is not involved in it", () => {
    const perFund = new Map([
      ["f1", { ...emptyStats(), awaitingApproval: 2, readyToRelease: 1 }],
      ["f2", { ...emptyStats(), awaitingApproval: 5, flagged: 3, lowFunds: [{ name: "Other fund", expectedCash: 10 }] }],
    ]);
    const mine = mergeStats((fundsInScope("approver", "a1", funds) as string[]).map((id) => perFund.get(id)!));
    expect(mine.awaitingApproval).toBe(2);
    expect(mine.flagged).toBe(0);
    expect(mine.lowFunds).toEqual([]);
    expect(mergeStats([...perFund.values()]).awaitingApproval).toBe(7);
    expect(mergeStats([]).oldestReviewHours).toBeNull();
  });
});
