import { expect, it } from "vitest";

import { friendlyError, positionsInLine, queueState, reportStatus } from "@/lib/grokbot/queue-view";

const NOW = Date.parse("2026-11-24T10:00:00Z");
const op = (patch: Partial<Parameters<typeof queueState>[0]>) => ({ status: "queued", runner_id: null, not_before: null, error: null, ...patch });

it("says in plain words where a job is", () => {
  expect(queueState(op({}), NOW)).toMatchObject({ key: "waiting", label: "Waiting" });
  expect(queueState(op({ status: "running" }), NOW)).toMatchObject({ key: "sending", detail: "Sent to the bot, waiting for it to start." });
  expect(queueState(op({ status: "running", runner_id: "r" }), NOW)).toMatchObject({ key: "sending", detail: "The bot is writing it now." });
  expect(queueState(op({ status: "completed" }), NOW)).toMatchObject({ key: "written" });
});

it("a job put back in the queue shows its wait until the time comes", () => {
  const later = new Date(NOW + 600000).toISOString();
  expect(queueState(op({ not_before: later, error: "will be tried again" }), NOW)).toMatchObject({ key: "retry_wait", detail: "will be tried again" });
  expect(queueState(op({ not_before: new Date(NOW - 1000).toISOString() }), NOW).key).toBe("waiting");
});

it("a stopped job needs attention, with the reason made readable", () => {
  expect(queueState(op({ status: "failed", error: "The Grokbot did not start this job after three tries." }), NOW)).toMatchObject({ key: "attention" });
  expect(friendlyError("Payload invalid for this routine: payload.operation_id (40a6) does not match")).toContain("different job's files");
  expect(friendlyError(null)).toContain("Nothing was written");
  expect(friendlyError("x".repeat(400)).length).toBeLessThanOrEqual(220);
});

it("numbers only the jobs still waiting, oldest first", () => {
  const ops = [
    { id: "c", status: "queued", created_at: "2026-11-24T03:00:00Z" },
    { id: "a", status: "queued", created_at: "2026-11-24T01:00:00Z" },
    { id: "r", status: "running", created_at: "2026-11-24T00:00:00Z" },
    { id: "b", status: "queued", created_at: "2026-11-24T02:00:00Z" },
  ];
  const place = positionsInLine(ops);
  expect([place.get("a"), place.get("b"), place.get("c"), place.has("r")]).toEqual([1, 2, 3, false]);
});

const started = new Date(NOW - 5 * 60000).toISOString();
const done = "2026-11-24T09:50:00Z";
const job = (patch = {}) => ({ status: "running", runner_id: "r", started_at: started, updated_at: started, ...patch });

it("says whether the bot has reported back, so a row in the sheet but not in the app is explained", () => {
  expect(reportStatus(job(), undefined, NOW)).toMatchObject({ key: "not_reported", detail: expect.stringContaining("5 minutes ago") });
  expect(reportStatus(job({ started_at: new Date(NOW - 60000).toISOString() }), undefined, NOW)?.detail).toContain("as soon as the bot reports back");
  expect(reportStatus({ ...job({ status: "queued" }) }, undefined, NOW)).toBeNull();
  expect(reportStatus(job({ status: "failed" }), undefined, NOW)).toBeNull();
});

it("after the report, shows whether the app has read the sheet", () => {
  const completed = job({ status: "completed", updated_at: done });
  expect(reportStatus(completed, { last_synced_at: "2026-11-24T09:40:00Z", sync_error: null }, NOW)?.key).toBe("reading");
  expect(reportStatus(completed, undefined, NOW)?.key).toBe("reading");
  expect(reportStatus(completed, { last_synced_at: "2026-11-24T09:55:00Z", sync_error: null }, NOW)?.key).toBe("synced");
  expect(reportStatus(completed, { last_synced_at: "2026-11-24T09:40:00Z", sync_error: "Refresh failed." }, NOW)?.key).toBe("read_failed");
});

it("a job the bot claimed and then went quiet on needs attention, with the way out spelled out", () => {
  const running = { status: "running", runner_id: "11111111-1111-4111-8111-111111111111" };
  expect(queueState(op({ ...running, updated_at: new Date(NOW - 5 * 60000).toISOString() }), NOW)).toMatchObject({ key: "sending" });
  const stuck = queueState(op({ ...running, updated_at: new Date(NOW - 40 * 60000).toISOString() }), NOW);
  expect(stuck.key).toBe("attention");
  expect(stuck.detail).toMatch(/40 minutes/);
  expect(stuck.detail).toMatch(/Retry/);
});
