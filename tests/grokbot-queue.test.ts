import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { dispatchGrokbot, queueGrokbotOperation } from "@/lib/grokbot/delivery";
import { GROKBOT_TARGETS } from "@/lib/grokbot/targets";

vi.mock("server-only", () => ({}));
const { state, rpc } = vi.hoisted(() => ({
  state: {
    inserted: [] as Record<string, unknown>[],
    updated: [] as Record<string, unknown>[],
    insertError: null as { code: string } | null,
    existing: { id: "", status: "blocked", spreadsheet_id: "", sheet_id: 0 },
  },
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc,
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        state.inserted.push(row);
        return { error: state.insertError };
      },
      select: () => ({
        eq: () => ({ single: async () => ({ data: state.existing, error: null }) }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          state.updated.push(values);
          return { error: null };
        },
      }),
    }),
  }),
}));

const id = "91000000-0000-4000-8000-000000000001";
const envelope = (book: "buying" | "dryve") => {
  const { spreadsheet_id, sheet_id, sheet_title } = GROKBOT_TARGETS[book];
  return { spreadsheet_id, sheet_id, sheet_title };
};
const event = (book: "buying" | "dryve") => ({
  protocol_version: "pcf.grokbot.v1", operation_id: id, target: envelope(book), event: "pcf.liquidation.approved",
  liquidation_id: id, voucher_id: id, voucher_number: "1728", requester_name: "Justine", department: "Ops", filing_date: "2026-11-12",
  custodian_approved_at: "2026-11-12T01:00:00Z", custodian_id: id, amount_received: "300.00", total_spent: "250.00",
  return_amount: "50.00", reimbursement_amount: "0.00",
  lines: [{
    entry_id: id, particulars: "Lunch", amount: "250.00", tag: "MEALS", expense_date: "2026-11-12", supplier: "", tin: "", receipt_number: "", plate: "",
    ...(book === "dryve" ? { company: "DRYVE" } : {}),
  }],
});

beforeEach(() => {
  state.inserted = [];
  state.updated = [];
  state.insertError = null;
  rpc.mockReset();
  vi.stubEnv("GROKBOT_WEBHOOK_URL", "https://api2.cursor.sh/automations/webhook/buying");
  vi.stubEnv("GROKBOT_WEBHOOK_SECRET", "buying-secret");
  vi.stubEnv("GROKBOT_DRYVE_WEBHOOK_URL", "https://api2.cursor.sh/automations/webhook/dryve");
  vi.stubEnv("GROKBOT_DRYVE_WEBHOOK_SECRET", "dryve-secret");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }))));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("saves a DRYVE liquidation against the DRYVE sheet, not Buying", async () => {
  await queueGrokbotOperation({ id, kind: "liquidation_approved", payload: event("dryve"), liquidationId: id });
  expect(state.inserted[0]).toMatchObject({ spreadsheet_id: GROKBOT_TARGETS.dryve.spreadsheet_id, sheet_id: GROKBOT_TARGETS.dryve.sheet_id });
});

it("saves a Buying liquidation against Buying", async () => {
  await queueGrokbotOperation({ id, kind: "liquidation_approved", payload: event("buying"), liquidationId: id });
  expect(state.inserted[0]).toMatchObject({ spreadsheet_id: GROKBOT_TARGETS.buying.spreadsheet_id, sheet_id: GROKBOT_TARGETS.buying.sheet_id });
});

it("refuses a caller that names a different sheet than the payload", async () => {
  await expect(
    queueGrokbotOperation({ id, kind: "liquidation_approved", book: "buying", payload: event("dryve"), liquidationId: id }),
  ).rejects.toThrow("different sheet");
  expect(state.inserted).toHaveLength(0);
});

it("moves a stopped operation that was saved against the wrong sheet to the right one", async () => {
  state.insertError = { code: "23505" };
  state.existing = { id, status: "blocked", spreadsheet_id: GROKBOT_TARGETS.buying.spreadsheet_id, sheet_id: GROKBOT_TARGETS.buying.sheet_id };
  expect(await queueGrokbotOperation({ id, kind: "liquidation_approved", payload: event("dryve"), liquidationId: id })).toBe(id);
  expect(state.updated).toEqual([{ spreadsheet_id: GROKBOT_TARGETS.dryve.spreadsheet_id, sheet_id: GROKBOT_TARGETS.dryve.sheet_id }]);
});

it("leaves a running operation alone", async () => {
  state.insertError = { code: "23505" };
  state.existing = { id, status: "running", spreadsheet_id: GROKBOT_TARGETS.buying.spreadsheet_id, sheet_id: GROKBOT_TARGETS.buying.sheet_id };
  await queueGrokbotOperation({ id, kind: "liquidation_approved", payload: event("dryve"), liquidationId: id });
  expect(state.updated).toHaveLength(0);
});

it("never delivers a job to a bot whose sheet the payload does not name", async () => {
  rpc.mockResolvedValue({
    data: [{ id, kind: "liquidation_approved", status: "running", runner_id: null, payload: event("dryve"),
      spreadsheet_id: GROKBOT_TARGETS.buying.spreadsheet_id, sheet_id: GROKBOT_TARGETS.buying.sheet_id }],
    error: null,
  });
  await expect(dispatchGrokbot()).rejects.toThrow("different sheet");
  expect(fetch).not.toHaveBeenCalled();
});

it("delivers a correctly saved DRYVE job to the DRYVE bot only", async () => {
  rpc.mockResolvedValue({
    data: [{ id, kind: "liquidation_approved", status: "running", runner_id: null, payload: event("dryve"),
      spreadsheet_id: GROKBOT_TARGETS.dryve.spreadsheet_id, sheet_id: GROKBOT_TARGETS.dryve.sheet_id }],
    error: null,
  });
  await dispatchGrokbot();
  expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe("https://api2.cursor.sh/automations/webhook/dryve");
});
