import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const dispatch = vi.fn();
let sheetLedger = false;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            table === "replenishments"
              ? { data: { fund_id: "fund-1", requested_by: "user-1" }, error: null }
              : { data: { sheet_ledger: sheetLedger }, error: null },
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "dryve" }, error: null }) }) }),
        }),
      }),
      update: () => ({ eq: () => ({ neq: async () => ({ error: null }) }) }),
    }),
    rpc,
  }),
}));
vi.mock("@/lib/grokbot/delivery", () => ({
  dispatchGrokbot: dispatch,
  grokbotCallbackToken: () => "token",
  retryGrokbotOperation: vi.fn(),
}));

describe("the sheet marker after a replenishment", () => {
  beforeEach(() => {
    rpc.mockReset();
    dispatch.mockReset();
    rpc.mockResolvedValue({ data: "operation", error: null });
  });

  it("is never queued for a database-only fund (it must not fall back to another fund's sheet)", async () => {
    sheetLedger = false;
    const { syncSheetRollover } = await import("@/lib/sheets/sync-rollover");
    await syncSheetRollover("replenishment-1");
    expect(rpc).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("is still queued for a fund that writes to a sheet", async () => {
    sheetLedger = true;
    const { syncSheetRollover } = await import("@/lib/sheets/sync-rollover");
    await syncSheetRollover("replenishment-1");
    expect(rpc).toHaveBeenCalledWith("queue_grokbot_replenishment", expect.objectContaining({ p_id: "replenishment-1" }));
    expect(dispatch).toHaveBeenCalled();
  });
});
