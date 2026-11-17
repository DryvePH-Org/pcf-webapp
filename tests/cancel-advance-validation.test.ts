import { describe, expect, it } from "vitest";

import { cancelAdvanceSchema, recordAdvanceReturnSchema } from "@/lib/validators/voucher";

const id = "3b241101-e2bb-4255-8caf-4136c566a962";

describe("cancelling an unused advance", () => {
  it("accepts a reason with the cash still out", () => {
    expect(cancelAdvanceSchema.safeParse({ voucher_id: id, reason: "plan_changed", note: "", cash_back: false }).success).toBe(true);
  });
  it("needs a date when the cash is back", () => {
    expect(cancelAdvanceSchema.safeParse({ voucher_id: id, reason: "not_needed", note: "", cash_back: true }).success).toBe(false);
    expect(cancelAdvanceSchema.safeParse({ voucher_id: id, reason: "not_needed", note: "", cash_back: true, returned_on: "2026-11-17" }).success).toBe(true);
  });
  it("needs a note for 'other' and refuses unknown reasons", () => {
    expect(cancelAdvanceSchema.safeParse({ voucher_id: id, reason: "other", note: "  ", cash_back: false }).success).toBe(false);
    expect(cancelAdvanceSchema.safeParse({ voucher_id: id, reason: "other", note: "Trip moved", cash_back: false }).success).toBe(true);
    expect(cancelAdvanceSchema.safeParse({ voucher_id: id, reason: "whatever", note: "", cash_back: false }).success).toBe(false);
  });
  it("needs a valid date to record the return", () => {
    expect(recordAdvanceReturnSchema.safeParse({ voucher_id: id, returned_on: "yesterday" }).success).toBe(false);
    expect(recordAdvanceReturnSchema.safeParse({ voucher_id: id, returned_on: "2026-11-17" }).success).toBe(true);
  });
});
