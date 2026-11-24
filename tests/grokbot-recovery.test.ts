import { expect, it } from "vitest";

import { GIVE_UP_AFTER_MS, MAX_ATTEMPTS, RETRY_WAIT_MS, STALLED_AFTER_MS, STALLED_ERROR, recoverStalledJobs, type StalledJob } from "@/lib/grokbot/recovery";
import { receiptDateProblem } from "@/lib/receipt-date";

const NOW = Date.parse("2026-11-24T10:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const job = (id: string, startedAgo: number, attempts = 1, quietFor = STALLED_AFTER_MS + 60000): StalledJob => ({
  id, created_at: ago(3 * 3600000), started_at: ago(startedAgo), updated_at: ago(quietFor), attempts,
});

function run(jobs: StalledJob[], options: { lost?: Set<string>; throwOn?: string } = {}) {
  const log = { resent: [] as string[], requeued: [] as { id: string; notBefore: string; note: string }[], failed: [] as { id: string; error: string }[], cutoff: "" };
  return recoverStalledJobs({
    now: NOW,
    listStalled: async (cutoff) => ((log.cutoff = cutoff), jobs),
    touch: async (item) => !options.lost?.has(item.id),
    requeue: async (item, notBefore, note) => void log.requeued.push({ id: item.id, notBefore, note }),
    fail: async (item, error) => void log.failed.push({ id: item.id, error }),
    deliver: async (item) => {
      if (item.id === options.throwOn) throw new Error("not configured");
      log.resent.push(item.id);
    },
  }).then((result) => ({ result, log }));
}

it("sends a job the bot never started again, and asks only about jobs quiet for 10 minutes", async () => {
  const { result, log } = await run([job("a", 12 * 60000)]);
  expect(result).toEqual({ resent: ["a"], requeued: [], failed: [] });
  expect(log.cutoff).toBe(ago(STALLED_AFTER_MS));
});

it("puts a job back in the queue with a wait that grows, after 20 minutes without a start", async () => {
  const first = await run([job("a", GIVE_UP_AFTER_MS + 60000, 1)]);
  expect(first.result.requeued).toEqual(["a"]);
  expect(first.log.requeued[0].notBefore).toBe(new Date(NOW + RETRY_WAIT_MS).toISOString());
  const second = await run([job("b", GIVE_UP_AFTER_MS + 60000, 2)]);
  expect(second.log.requeued[0].notBefore).toBe(new Date(NOW + 2 * RETRY_WAIT_MS).toISOString());
  expect(second.log.requeued[0].note).toContain("20 minutes");
});

it("leaves a job for a person after three starts", async () => {
  const { result, log } = await run([job("old", GIVE_UP_AFTER_MS + 60000, MAX_ATTEMPTS)]);
  expect(result).toEqual({ resent: [], requeued: [], failed: ["old"] });
  expect(log.failed[0].error).toBe(STALLED_ERROR);
});

it("treats a job from before the queue was paced (no start time) by when it was created", async () => {
  const legacy: StalledJob = { id: "legacy", created_at: ago(3 * 3600000), started_at: null, updated_at: ago(20 * 60000), attempts: 0 };
  const { result, log } = await run([legacy]);
  expect(result.requeued).toEqual(["legacy"]);
  expect(log.requeued[0].notBefore).toBe(new Date(NOW + RETRY_WAIT_MS).toISOString());
});

it("leaves a job alone when another caller already acted on it, and one failure does not stop the rest", async () => {
  const jobs = [job("taken", 12 * 60000), job("broken", 12 * 60000), job("fine", 12 * 60000)];
  const { result } = await run(jobs, { lost: new Set(["taken"]), throwOn: "broken" });
  expect(result).toEqual({ resent: ["fine"], requeued: [], failed: [] });
});

it("questions a receipt date after the filing date or months before it, and accepts a normal one", () => {
  expect(receiptDateProblem("2026-11-20", "2026-11-23")).toBeNull();
  expect(receiptDateProblem("2026-11-23", "2026-11-23")).toBeNull();
  expect(receiptDateProblem("2026-09-01", "2026-11-23")).toBeNull();
  expect(receiptDateProblem("2024-01-18", "2026-11-23")).toContain("more than 90 days before");
  expect(receiptDateProblem("2026-11-25", "2026-11-23")).toContain("after the filing date");
});
