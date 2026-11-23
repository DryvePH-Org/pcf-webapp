import { describe, expect, it } from "vitest";

import { buildReplenishmentTimeline, type TimelineInput } from "@/lib/replenishment-timeline";

const base: TimelineInput = {
  status: "closed", total: "32573.00", preparedBy: "Custodian", preparedAt: "2026-11-20T02:00:00Z",
  reviewedBy: "Accounting", reviewedAt: "2026-11-23T02:30:00Z", reviewNote: null,
  approvedBy: "Approver", approvedAt: "2026-11-23T03:10:00Z",
  marker: { state: "encoded", number: 13, at: "2026-11-23T03:16:00Z", error: null },
  handedOverOn: "2026-11-21", handedOverAmount: "32573.00", handoverNote: null, recordedBy: "Accounting", recordedAt: "2026-11-23T06:00:00Z",
};
const states = (input: TimelineInput) => buildReplenishmentTimeline(input).map((step) => `${step.key}:${step.state}`);

describe("the replenishment timeline", () => {
  it("a finished replenishment shows every step, with the real handover day apart from the day it was recorded", () => {
    expect(states(base)).toEqual(["prepared:done", "accounting:done", "approver:done", "sheet:done", "handover:done", "budget:done"]);
    const steps = buildReplenishmentTimeline(base);
    expect(steps.find((s) => s.key === "sheet")?.detail).toContain("REPLENISHMENT #13 written to the Google Sheet");
    const handover = steps.find((s) => s.key === "handover")!.detail;
    expect(handover).toContain("Nov 21, 2026 · ₱32,573.00");
    expect(handover).toContain("recorded by Accounting on Nov 23, 2026");
  });

  it("approved but not handed over: the budget has not come back, and the next step is accounting's", () => {
    const steps = buildReplenishmentTimeline({ ...base, status: "approved", handedOverOn: null, handedOverAmount: null, recordedBy: null, recordedAt: null });
    expect(steps.map((s) => `${s.key}:${s.state}`)).toEqual(["prepared:done", "accounting:done", "approver:done", "sheet:done", "handover:waiting", "budget:todo"]);
    expect(steps.find((s) => s.key === "handover")?.detail).toContain("Waiting for Accounting");
  });

  it("waiting for the approver, and for Accounting before that", () => {
    expect(states({ ...base, status: "accounting_approved", approvedAt: null, approvedBy: null, marker: null, handedOverOn: null })).toEqual(["prepared:done", "accounting:done", "approver:waiting", "handover:todo", "budget:todo"]);
    expect(states({ ...base, status: "submitted", reviewedAt: null, reviewedBy: null, approvedAt: null, approvedBy: null, marker: null, handedOverOn: null })).toEqual(["prepared:done", "accounting:waiting", "approver:todo", "handover:todo", "budget:todo"]);
  });

  it("a handover of a different amount shows the approved amount and the reason", () => {
    const detail = buildReplenishmentTimeline({ ...base, handedOverAmount: "32523.00", handoverNote: "PHP 50 kept for the bank fee" }).find((s) => s.key === "handover")!.detail;
    expect(detail).toContain("₱32,523.00 (approved ₱32,573.00: PHP 50 kept for the bank fee)");
  });

  it("a marker Grokbot could not write is a stopped step with the reason; a fund without a sheet has no marker step", () => {
    const stopped = buildReplenishmentTimeline({ ...base, status: "approved", handedOverOn: null, marker: { state: "attention", number: 13, at: null, error: "row 78 is taken" } });
    expect(stopped.find((s) => s.key === "sheet")).toMatchObject({ state: "stopped" });
    expect(stopped.find((s) => s.key === "sheet")?.detail).toContain("row 78 is taken");
    expect(buildReplenishmentTimeline({ ...base, marker: null }).some((s) => s.key === "sheet")).toBe(false);
  });

  it("a rejected replenishment stops at the rejection with its reason", () => {
    const steps = buildReplenishmentTimeline({ ...base, status: "rejected", reviewNote: "Totals do not match", approvedAt: null, approvedBy: null });
    expect(steps.map((s) => s.key)).toEqual(["prepared", "accounting"]);
    expect(steps[1]).toMatchObject({ state: "stopped", label: "Rejected" });
    expect(steps[1].detail).toContain("Totals do not match");
  });
});
