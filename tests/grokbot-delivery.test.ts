import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { dispatchGrokbot, retryGrokbotOperation } from "@/lib/grokbot/delivery";

vi.mock("server-only", () => ({}));
const { state, rpc } = vi.hoisted(() => ({
  state: { operation: {} as Record<string, unknown> },
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc,
    from: () => ({
      update: () => ({
        eq: () => ({ error: null, in: async () => ({ error: null }) }),
      }),
      select: () => ({
        eq: () => ({
          single: async () => ({ data: state.operation, error: null }),
        }),
      }),
    }),
  }),
}));
beforeEach(() => {
  vi.stubEnv(
    "GROKBOT_WEBHOOK_URL",
    "https://api2.cursor.sh/automations/webhook/test",
  );
  vi.stubEnv("GROKBOT_WEBHOOK_SECRET", "private-webhook-secret");
  state.operation = {
    id: "94000000-0000-4000-8000-000000000001",
    kind: "integration_test",
    status: "running",
    runner_id: null,
    payload: {
      lines: Array.from({ length: 40 }, () => ({
        particulars: "Long financial data ".repeat(100),
      })),
    },
  };
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [state.operation], error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ success: true }))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("sends a compact notification independent of financial payload size", async () => {
  await dispatchGrokbot();
  const request = vi.mocked(fetch).mock.calls[0][1]!;
  const body = String(request.body);
  const notice = JSON.parse(body);
  expect(Buffer.byteLength(body)).toBeLessThan(1000);
  expect(notice.operation_id).toBe(state.operation.id);
  expect(notice.callback.url).toContain(
    "/api/grokbot/operations/" + state.operation.id,
  );
  expect(notice.callback.token).toHaveLength(64);
  expect(notice.payload).toBeUndefined();
  expect(body).not.toContain("Long financial data");
  expect(body).not.toContain("private-webhook-secret");
});
it("redelivers an unclaimed operation with its stable ID and preserves an owned runner", async () => {
  await retryGrokbotOperation(String(state.operation.id));
  expect(
    JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body)).operation_id,
  ).toBe(state.operation.id);
  expect(rpc).not.toHaveBeenCalled();
  vi.mocked(fetch).mockClear();
  state.operation.runner_id = "94000000-0000-4000-8000-000000000002";
  await retryGrokbotOperation(String(state.operation.id));
  expect(fetch).not.toHaveBeenCalled();
});
it("delivers each sheet's operation to its own bot with its own secret", async () => {
  vi.stubEnv("GROKBOT_DRYVE_WEBHOOK_URL", "https://api2.cursor.sh/automations/webhook/dryve");
  vi.stubEnv("GROKBOT_DRYVE_WEBHOOK_SECRET", "dryve-webhook-secret");
  const buyingNotice = async () => {
    await dispatchGrokbot();
    const call = vi.mocked(fetch).mock.calls.at(-1)!;
    return { url: String(call[0]), headers: call[1]!.headers as Record<string, string>, notice: JSON.parse(String(call[1]!.body)) };
  };
  const buying = await buyingNotice();
  expect(buying.url).toBe("https://api2.cursor.sh/automations/webhook/test");
  expect(buying.headers.Authorization).toBe("Bearer private-webhook-secret");

  vi.mocked(fetch).mockClear();
  state.operation.spreadsheet_id = "1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ";
  state.operation.sheet_id = 1251133408;
  const dryve = await buyingNotice();
  expect(dryve.url).toBe("https://api2.cursor.sh/automations/webhook/dryve");
  expect(dryve.headers.Authorization).toBe("Bearer dryve-webhook-secret");
  // The callback token comes from that bot's own secret, so one bot's token is useless for the other's jobs.
  expect(dryve.notice.callback.token).toHaveLength(64);
  expect(dryve.notice.callback.token).not.toBe(buying.notice.callback.token);
  expect(JSON.stringify(dryve.notice)).not.toContain("dryve-webhook-secret");
});
it("does not deliver a DRYVE operation when its bot is not configured", async () => {
  state.operation.spreadsheet_id = "1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ";
  state.operation.sheet_id = 1251133408;
  await expect(dispatchGrokbot()).rejects.toThrow("not configured");
  expect(fetch).not.toHaveBeenCalled();
});
