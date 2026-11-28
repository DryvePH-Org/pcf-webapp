// A job the bot was told about but never started (no runner claimed it) holds the queue: the app feeds the bots one
// job at a time. This sends such a job again every few minutes (the bot's claim is atomic, so a second notice for the
// same job does no harm). If the bot still has not started it after 20 minutes, the job goes back in the queue with a
// wait that grows each time. After three starts it is left for a person ("needs attention") and can be retried.

export const STALLED_AFTER_MS = 10 * 60 * 1000;
export const GIVE_UP_AFTER_MS = 20 * 60 * 1000;
// A bot that claimed a job and then went silent (for example its Google connection expired mid-run) leaves it "running"
// for good. A real write takes a few minutes, so a claimed job with no news for this long is treated as stuck.
export const STUCK_AFTER_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const RETRY_WAIT_MS = 10 * 60 * 1000;
export const STALLED_ERROR = "The Grokbot did not start this job after three tries. Use the retry button to send it again.";
export const requeueNote = (waitMinutes: number) => `The Grokbot did not start this job. It will be tried again in about ${waitMinutes} minutes.`;

export type StalledJob = { id: string; created_at: string; started_at: string | null; updated_at: string; attempts: number };

export type RecoveryDeps<T extends StalledJob> = {
  // jobs that are running, unclaimed, and quiet since before the cutoff
  listStalled(cutoffIso: string): Promise<T[]>;
  // true only for the caller that wins the right to act on this job now
  touch(job: T): Promise<boolean>;
  requeue(job: T, notBeforeIso: string, note: string): Promise<void>;
  fail(job: T, error: string): Promise<void>;
  deliver(job: T): Promise<void>;
  now?: number;
};

export async function recoverStalledJobs<T extends StalledJob>(
  deps: RecoveryDeps<T>,
): Promise<{ resent: string[]; requeued: string[]; failed: string[] }> {
  const now = deps.now ?? Date.now();
  const result = { resent: [] as string[], requeued: [] as string[], failed: [] as string[] };
  for (const job of await deps.listStalled(new Date(now - STALLED_AFTER_MS).toISOString())) {
    if (!(await deps.touch(job))) continue;
    const startedAt = Date.parse(job.started_at ?? job.created_at);
    if (now - startedAt < GIVE_UP_AFTER_MS) {
      try {
        await deps.deliver(job);
        result.resent.push(job.id);
      } catch {
        // one job that cannot be sent (for example its bot is not configured) must not stop the others
      }
    } else if (job.attempts < MAX_ATTEMPTS) {
      const wait = Math.max(job.attempts, 1) * RETRY_WAIT_MS;
      await deps.requeue(job, new Date(now + wait).toISOString(), requeueNote(wait / 60000));
      result.requeued.push(job.id);
    } else {
      await deps.fail(job, STALLED_ERROR);
      result.failed.push(job.id);
    }
  }
  return result;
}

// True for a job a bot claimed but has not reported on for too long. Never for one nobody claimed (that is the stalled
// case above) and never for a finished one.
export function isStuck(op: { status: string; runner_id: string | null; updated_at?: string | null }, now = Date.now()): boolean {
  if (op.status !== "running" || !op.runner_id || !op.updated_at) return false;
  const quiet = now - Date.parse(op.updated_at);
  return Number.isFinite(quiet) && quiet > STUCK_AFTER_MS;
}
