import { describe, expect, it } from "vitest";

import { isOutOfDate } from "@/lib/update-notice";

describe("is this page out of date?", () => {
  it("only when both builds are known and they differ", () => {
    expect(isOutOfDate("abc", "abc")).toBe(false);
    expect(isOutOfDate("abc", "xyz")).toBe(true);
    expect(isOutOfDate("", "xyz")).toBe(false);
    expect(isOutOfDate("abc", "")).toBe(false);
    expect(isOutOfDate("abc", null)).toBe(false);
    expect(isOutOfDate("abc", undefined)).toBe(false);
  });
});
