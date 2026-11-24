// A job the bot was told about but never started (no runner claimed it) holds its sheet's queue: a sheet runs one
// job at a time, so everything behind it waits. This sends such a job again every few minutes (the bot's claim is
// atomic, so a second notice for the same job does no harm) and, if the bot still has not started it after an
// hour, marks it failed so the next job can run. A failed job can be sent again with the retry button.

export const STALLED_AFTER_MS = 15 * 60 * 1000;
export const GIVE_UP_AFTER_MS = 60 * 60 * 1000;
export const STALLED_ERROR = "The Grokbot did not start this job within an hour. Use the retry button to send it again.";

export type StalledJob = { id: string; created_at: string; updated_at: string };

export type RecoveryDeps<T extends StalledJob> = {
  // jobs that are running, unclaimed, and quiet since before the cutoff
  listStalled(cutoffIso: string): Promise<T[]>;
  // true only for the caller that wins the right to act on this job now
  touch(job: T): Promise<boolean>;
  fail(job: T, error: string): Promise<void>;
  deliver(job: T): Promise<void>;
  now?: number;
};

export async function recoverStalledJobs<T extends StalledJob>(deps: RecoveryDeps<T>): Promise<{ resent: string[]; failed: string[] }> {
  const now = deps.now ?? Date.now();
  const result = { resent: [] as string[], failed: [] as string[] };
  for (const job of await deps.listStalled(new Date(now - STALLED_AFTER_MS).toISOString())) {
    if (!(await deps.touch(job))) continue;
    if (now - Date.parse(job.created_at) >= GIVE_UP_AFTER_MS) {
      await deps.fail(job, STALLED_ERROR);
      result.failed.push(job.id);
    } else {
      try {
        await deps.deliver(job);
        result.resent.push(job.id);
      } catch {
        // one job that cannot be sent (for example its bot is not configured) must not stop the others
      }
    }
  }
  return result;
}
