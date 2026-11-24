import { expect, it } from "vitest";

import { GIVE_UP_AFTER_MS, STALLED_AFTER_MS, STALLED_ERROR, recoverStalledJobs, type StalledJob } from "@/lib/grokbot/recovery";
import { receiptDateProblem } from "@/lib/receipt-date";

const NOW = Date.parse("2026-11-24T10:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function run(jobs: StalledJob[], options: { lost?: Set<string>; throwOn?: string } = {}) {
  const log = { resent: [] as string[], failed: [] as { id: string; error: string }[], cutoff: "" };
  return recoverStalledJobs({
    now: NOW,
    listStalled: async (cutoff) => ((log.cutoff = cutoff), jobs),
    touch: async (job) => !options.lost?.has(job.id),
    fail: async (job, error) => void log.failed.push({ id: job.id, error }),
    deliver: async (job) => {
      if (job.id === options.throwOn) throw new Error("not configured");
      log.resent.push(job.id);
    },
  }).then((result) => ({ result, log }));
}

it("sends a job the bot never started again, and asks only about jobs quiet for 15 minutes", async () => {
  const { result, log } = await run([{ id: "a", created_at: ago(30 * 60000), updated_at: ago(20 * 60000) }]);
  expect(result).toEqual({ resent: ["a"], failed: [] });
  expect(log.cutoff).toBe(ago(STALLED_AFTER_MS));
});

it("marks a job failed after an hour so the next one on that sheet can run", async () => {
  const { result, log } = await run([{ id: "old", created_at: ago(GIVE_UP_AFTER_MS + 60000), updated_at: ago(20 * 60000) }]);
  expect(result).toEqual({ resent: [], failed: ["old"] });
  expect(log.failed[0].error).toBe(STALLED_ERROR);
  expect(log.resent).toEqual([]);
});

it("leaves a job alone when another caller already acted on it, and one failure does not stop the rest", async () => {
  const jobs = [
    { id: "taken", created_at: ago(30 * 60000), updated_at: ago(20 * 60000) },
    { id: "broken", created_at: ago(30 * 60000), updated_at: ago(20 * 60000) },
    { id: "fine", created_at: ago(30 * 60000), updated_at: ago(20 * 60000) },
  ];
  const { result } = await run(jobs, { lost: new Set(["taken"]), throwOn: "broken" });
  expect(result).toEqual({ resent: ["fine"], failed: [] });
});

it("questions a receipt date after the filing date or months before it, and accepts a normal one", () => {
  expect(receiptDateProblem("2026-11-20", "2026-11-23")).toBeNull();
  expect(receiptDateProblem("2026-11-23", "2026-11-23")).toBeNull();
  expect(receiptDateProblem("2026-09-01", "2026-11-23")).toBeNull();
  expect(receiptDateProblem("2024-01-18", "2026-11-23")).toContain("more than 90 days before");
  expect(receiptDateProblem("2026-11-25", "2026-11-23")).toContain("after the filing date");
});
