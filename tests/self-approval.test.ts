import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { mayReviewOwner } from "@/lib/self-approval";
import type { WorkflowDatabase } from "@/lib/workflow";

const client = (result: { data: boolean | null; error: unknown }) => {
  const rpc = vi.fn(async () => result);
  return { db: { rpc } as unknown as SupabaseClient<WorkflowDatabase>, rpc };
};

describe("who may review a liquidation", () => {
  it("lets anyone but the owner through without asking the database", async () => {
    const { db, rpc } = client({ data: false, error: null });
    expect(await mayReviewOwner(db, { id: "a", role: "custodian" }, "fund", "someone-else")).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lets the owner review her own only as a custodian of a fund that allows it", async () => {
    expect(await mayReviewOwner(client({ data: true, error: null }).db, { id: "a", role: "custodian" }, "fund", "a")).toBe(true);
    expect(await mayReviewOwner(client({ data: false, error: null }).db, { id: "a", role: "custodian" }, "fund", "a")).toBe(false);
  });

  it("never lets other roles, or a failed check, review their own", async () => {
    const { db, rpc } = client({ data: true, error: null });
    expect(await mayReviewOwner(db, { id: "a", role: "admin" }, "fund", "a")).toBe(false);
    expect(await mayReviewOwner(db, { id: "a", role: "approver" }, "fund", "a")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(await mayReviewOwner(client({ data: null, error: { message: "boom" } }).db, { id: "a", role: "custodian" }, "fund", "a")).toBe(false);
  });

  it("lets the fund's assigned approver review a custodian's liquidation, and no other approver", async () => {
    const { db, rpc } = client({ data: true, error: null });
    expect(await mayReviewOwner(db, { id: "approver", role: "approver" }, "fund", "custodian")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("approver_reviews_owner", { p_fund: "fund", p_owner: "custodian" });
    expect(await mayReviewOwner(client({ data: false, error: null }).db, { id: "approver", role: "approver" }, "fund", "custodian")).toBe(false);
    expect(await mayReviewOwner(client({ data: null, error: { message: "boom" } }).db, { id: "approver", role: "approver" }, "fund", "custodian")).toBe(false);
  });
});
