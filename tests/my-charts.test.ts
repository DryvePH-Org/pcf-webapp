import { describe, expect, it } from "vitest";

import { ageBucket, averageBetween, DAY_MS, hasData, lastMonths, monthKey, sumByMonth, topWithOther } from "@/lib/my-charts";

describe("lastMonths", () => {
  it("lists the months oldest first, across a year end", () => {
    expect(lastMonths(4, new Date("2027-02-10T04:00:00Z"))).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
  it("uses the Manila calendar, not UTC", () => {
    // 1 Dec 00:30 in Manila is still 30 Nov in UTC
    expect(lastMonths(1, new Date("2026-11-30T16:30:00Z"))).toEqual(["2026-12"]);
    expect(monthKey("2026-11-30T16:30:00Z")).toBe("2026-12");
  });
});

describe("sumByMonth", () => {
  const months = ["2026-10", "2026-11"];
  it("adds per month and leaves out other months and missing dates", () => {
    const rows = [
      { at: "2026-10-05T04:00:00Z", amount: 100.5 },
      { at: "2026-10-20T04:00:00Z", amount: 50 },
      { at: "2026-11-02T04:00:00Z", amount: 20 },
      { at: "2026-05-02T04:00:00Z", amount: 999 },
      { at: null, amount: 1 },
    ];
    expect(sumByMonth(rows, months, (row) => row.at, (row) => row.amount)).toEqual([150.5, 20]);
  });
});

describe("topWithOther", () => {
  it("groups by label, sorts, and folds the tail", () => {
    const rows = ["a", "b", "c", "d"].map((label, index) => ({ label, value: (index + 1) * 10 }));
    expect(topWithOther([...rows, { label: "d", value: 5 }], 3)).toEqual([
      { label: "d", value: 45 },
      { label: "c", value: 30 },
      { label: "Other", value: 30 },
    ]);
  });
  it("keeps everything when it fits", () => {
    expect(topWithOther([{ label: "x", value: 1 }], 6)).toEqual([{ label: "x", value: 1 }]);
  });
});

describe("ageBucket and averageBetween", () => {
  it("buckets days waiting", () => {
    expect([0, 1, 2, 3, 4, 7, 8].map(ageBucket)).toEqual([
      "Today or yesterday", "Today or yesterday", "2 to 3 days", "2 to 3 days", "4 to 7 days", "4 to 7 days", "Over a week",
    ]);
  });
  it("averages the time between two moments and ignores incomplete or backwards pairs", () => {
    const pairs = [
      { from: "2026-11-01T00:00:00Z", to: "2026-11-03T00:00:00Z" },
      { from: "2026-11-01T00:00:00Z", to: "2026-11-02T00:00:00Z" },
      { from: null, to: "2026-11-02T00:00:00Z" },
      { from: "2026-11-05T00:00:00Z", to: "2026-11-01T00:00:00Z" },
    ];
    expect(averageBetween(pairs, DAY_MS)).toBe(1.5);
    expect(averageBetween([], DAY_MS)).toBeNull();
  });
});

describe("hasData", () => {
  it("is false when every value is zero", () => {
    expect(hasData({ kind: "bars", title: "", description: "", unit: "count", rows: [{ label: "a", value: 0 }], empty: "" })).toBe(false);
    expect(hasData({ kind: "paired", title: "", description: "", unit: "money", a: "", b: "", points: [{ label: "", full: "", a: 0, b: 2 }] })).toBe(true);
  });
});
