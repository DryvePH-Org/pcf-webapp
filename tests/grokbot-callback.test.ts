import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/grokbot/operations/[id]/route";
vi.mock("@/lib/grokbot/delivery", () => ({ dispatchGrokbot: vi.fn() }));
const id = "91000000-0000-4000-8000-000000000001";
const token = "test-callback-token-long-enough-for-validation";
const { state, update, rpc } = vi.hoisted(() => ({
  state: { record: null as Record<string, unknown> | null },
  rpc: vi.fn(async () => ({ data: false, error: null })),
  update: vi.fn(() => ({ eq: () => ({ in: async () => ({ error: null }) }) })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc,
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
  rpc.mockClear();
  state.record = {
    id,
    kind: "reference_audit",
    status: "queued",
    callback_hash: createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + 60000).toISOString(),
    report: null,
    payload: {},
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

it("requires a runner claim and rejects another runner or unverified financial completion", async () => {
  const runner = "91000000-0000-4000-8000-000000000003";
  state.record = {
    ...state.record,
    kind: "liquidation_approved",
    status: "running",
    runner_id: runner,
  };
  expect(
    (
      await POST(
        request({ operation_id: id, status: "running", report: {} }),
        context,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          operation_id: id,
          status: "running",
          runner_id: runner,
          report: {},
        }),
        context,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await POST(
        request({
          operation_id: id,
          status: "completed",
          runner_id: "91000000-0000-4000-8000-000000000004",
          report: { verified: true },
        }),
        context,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await POST(
        request({
          operation_id: id,
          status: "completed",
          runner_id: runner,
          report: { verified: true },
        }),
        context,
      )
    ).status,
  ).toBe(422);
  expect(update).not.toHaveBeenCalled();
});

it("serves the complete authenticated payload outside the compact webhook", async () => {
  const lines = Array.from({ length: 40 }, (_, index) => ({
    entry_id: index,
    particulars: "Exact line " + index,
  }));
  state.record!.payload = { event: "pcf.liquidation.approved", lines };
  state.record!.kind = "liquidation_approved";
  const response = await GET(
    new Request(
      "https://pcf.dryveph.io/api/grokbot/operations/" + id + "?part=payload",
      { headers: { authorization: "Bearer " + token } },
    ),
    context,
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.payload.lines).toEqual(lines);
  expect(body.operation_id).toBe(id);
  expect(JSON.stringify(body)).not.toContain("callback_hash");
  expect(JSON.stringify(body)).not.toContain(token);
});
it("distinguishes dispatched jobs from owned runner claims without exposing the owner's UUID", async () => {
  const runner = "91000000-0000-4000-8000-000000000003";
  state.record = { ...state.record, status: "running", runner_id: null };
  const read = () =>
    GET(
      new Request("https://pcf.dryveph.io/api/grokbot/operations/" + id, {
        headers: { authorization: "Bearer " + token },
      }),
      context,
    );
  expect(await (await read()).json()).toMatchObject({
    status: "running",
    runner_claimed: false,
    next_action: "claim_runner",
  });
  state.record.runner_id = runner;
  const owned = await (await read()).json();
  expect(owned).toMatchObject({
    runner_claimed: true,
    next_action: "resume_with_saved_runner_or_stop",
  });
  expect(JSON.stringify(owned)).not.toContain(runner);
});
