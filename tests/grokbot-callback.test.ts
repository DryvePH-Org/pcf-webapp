import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/grokbot/operations/[id]/route";
const id = "91000000-0000-4000-8000-000000000001";
const token = "test-callback-token-long-enough-for-validation";
const { state, update } = vi.hoisted(() => ({
  state: { record: null as Record<string, unknown> | null },
  update: vi.fn(() => ({ eq: () => ({ in: async () => ({ error: null }) }) })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.record, error: null }),
        }),
      }),
      update,
    }),
  }),
}));
beforeEach(() => {
  update.mockClear();
  state.record = {
    id,
    kind: "reference_audit",
    status: "queued",
    callback_hash: createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + 60000).toISOString(),
    report: null,
  };
});
const context = { params: Promise.resolve({ id }) };
const request = (body: unknown, secret = token) =>
  new Request("https://pcf.dryveph.io/api/grokbot/operations/" + id, {
    method: "POST",
    headers: {
      authorization: "Bearer " + secret,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
it("requires the scoped token and hides it from operation reads", async () => {
  expect(
    (await POST(request({}, "incorrect-token-with-sufficient-length"), context))
      .status,
  ).toBe(401);
  const response = await GET(
    new Request("https://pcf.dryveph.io/api/grokbot/operations/" + id, {
      headers: { authorization: "Bearer " + token },
    }),
    context,
  );
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain("callback_hash");
});
it("requires a matching operation and completion report", async () => {
  expect(
    (await POST(request({ operation_id: id, status: "completed" }), context))
      .status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          operation_id: "91000000-0000-4000-8000-000000000002",
          status: "completed",
          report: { verified: true },
        }),
        context,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          operation_id: id,
          status: "completed",
          report: { verified: true },
        }),
        context,
      )
    ).status,
  ).toBe(200);
  expect(update).toHaveBeenCalledOnce();
});
it("acknowledges duplicate completion without rewriting a terminal result", async () => {
  state.record!.status = "completed";
  const response = await POST(
    request({
      operation_id: id,
      status: "completed",
      report: { verified: true },
    }),
    context,
  );
  expect(await response.json()).toMatchObject({
    already_recorded: true,
    status: "completed",
  });
  expect(update).not.toHaveBeenCalled();
});
