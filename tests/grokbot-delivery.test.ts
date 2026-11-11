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
