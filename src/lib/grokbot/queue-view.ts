// What a custodian sees for each job in the sheet queue, in plain words.

export type QueueStateKey = "waiting" | "retry_wait" | "sending" | "written" | "attention";

export type QueueOp = {
  status: string;
  runner_id: string | null;
  not_before: string | null;
  error: string | null;
};

export const STATE_LABELS: Record<QueueStateKey, string> = {
  waiting: "Waiting",
  retry_wait: "Waiting to retry",
  sending: "Sending",
  written: "Written",
  attention: "Needs attention",
};

export function friendlyError(error: string | null): string {
  const text = (error ?? "").trim();
  if (!text) return "The bot did not finish this job. Nothing was written. Use Retry to send it again.";
  if (/operation_id/i.test(text) && /match/i.test(text))
    return "The bot stopped because it opened a different job's files. Nothing was written. Use Retry to send it again.";
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

export function queueState(op: QueueOp, now = Date.now()): { key: QueueStateKey; label: string; detail: string } {
  if (op.status === "completed") return { key: "written", label: STATE_LABELS.written, detail: "In the sheet." };
  if (op.status === "blocked" || op.status === "failed") return { key: "attention", label: STATE_LABELS.attention, detail: friendlyError(op.error) };
  if (op.status === "running")
    return {
      key: "sending",
      label: STATE_LABELS.sending,
      detail: op.runner_id ? "The bot is writing it now." : "Sent to the bot, waiting for it to start.",
    };
  if (op.not_before && Date.parse(op.not_before) > now)
    return { key: "retry_wait", label: STATE_LABELS.retry_wait, detail: op.error || "The bot did not start it. It will be tried again soon." };
  return { key: "waiting", label: STATE_LABELS.waiting, detail: "In the queue." };
}

// Place in line for the jobs still waiting to be handed to a bot (oldest first), starting at 1.
export function positionsInLine<T extends { id: string; status: string; created_at: string }>(ops: T[]): Map<string, number> {
  const waiting = ops.filter((op) => op.status === "queued").sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return new Map(waiting.map((op, index) => [op.id, index + 1]));
}
