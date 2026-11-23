import { formatDate, formatDateTime } from "@/lib/dates";
import { formatPHP } from "@/lib/money";

// Who did what and when for one replenishment, in the order it happens, so nobody has to guess where it stands.
export type TimelineInput = {
  status: string;
  total: string;
  preparedBy: string;
  preparedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  // null when the fund keeps no sheet
  marker: { state: "waiting" | "encoding" | "encoded" | "attention"; number: number | null; at: string | null; error: string | null } | null;
  handedOverOn: string | null;
  handedOverAmount: string | null;
  handoverNote: string | null;
  recordedBy: string | null;
  recordedAt: string | null;
};
export type TimelineState = "done" | "waiting" | "stopped" | "todo";
export type TimelineStep = { key: string; label: string; state: TimelineState; detail: string };

export function buildReplenishmentTimeline(input: TimelineInput): TimelineStep[] {
  const rejected = input.status === "rejected";
  const closed = input.status === "closed";
  const approved = input.status === "approved" || closed;
  const steps: TimelineStep[] = [];

  steps.push({ key: "prepared", label: "Prepared", state: "done", detail: `${input.preparedBy} · ${formatDateTime(input.preparedAt)}` });

  if (input.reviewedAt && input.reviewedBy && !rejected) {
    steps.push({ key: "accounting", label: "Accounting approved", state: "done", detail: `${input.reviewedBy} · ${formatDateTime(input.reviewedAt)}` });
  } else if (rejected) {
    steps.push({ key: "accounting", label: "Rejected", state: "stopped", detail: `${input.reviewedBy ? `${input.reviewedBy}${input.reviewedAt ? ` · ${formatDateTime(input.reviewedAt)}` : ""}` : "Not approved"}${input.reviewNote ? `. ${input.reviewNote}` : ""}` });
    return steps;
  } else {
    steps.push({ key: "accounting", label: "Accounting review", state: input.status === "submitted" ? "waiting" : "todo", detail: input.status === "submitted" ? "Waiting for Accounting" : "After it is submitted" });
  }

  if (input.approvedAt && input.approvedBy) {
    steps.push({ key: "approver", label: "Approver approved", state: "done", detail: `${input.approvedBy} · ${formatDateTime(input.approvedAt)}` });
  } else {
    steps.push({ key: "approver", label: "Approver approval", state: input.status === "accounting_approved" ? "waiting" : "todo", detail: input.status === "accounting_approved" ? "Waiting for the approver" : "After Accounting" });
  }

  if (input.marker) {
    const number = input.marker.number ? `REPLENISHMENT #${input.marker.number}` : "the replenishment marker";
    steps.push({
      key: "sheet",
      label: "Sheet marker",
      state: input.marker.state === "encoded" ? "done" : input.marker.state === "attention" ? "stopped" : approved ? "waiting" : "todo",
      detail:
        input.marker.state === "encoded"
          ? `${number} written to the Google Sheet${input.marker.at ? ` · ${formatDateTime(input.marker.at)}` : ""}`
          : input.marker.state === "attention"
            ? `Grokbot could not write ${number}${input.marker.error ? `: ${input.marker.error}` : ""}`
            : approved
              ? "Grokbot is writing the marker"
              : "Written by Grokbot after both approvals",
    });
  }

  if (closed && input.handedOverOn) {
    const amount = input.handedOverAmount ?? input.total;
    const differs = Math.abs(Number(amount) - Number(input.total)) >= 0.01;
    steps.push({
      key: "handover",
      label: "Cash handed to the custodian",
      state: "done",
      detail: `${formatDate(input.handedOverOn)} · ${formatPHP(amount)}${differs ? ` (approved ${formatPHP(input.total)}${input.handoverNote ? `: ${input.handoverNote}` : ""})` : ""}${input.recordedBy ? ` · recorded by ${input.recordedBy}${input.recordedAt ? ` on ${formatDateTime(input.recordedAt)}` : ""}` : ""}`,
    });
  } else if (closed) {
    steps.push({ key: "handover", label: "Cash handed to the custodian", state: "done", detail: `Recorded${input.recordedBy ? ` by ${input.recordedBy}` : ""}${input.recordedAt ? ` · ${formatDateTime(input.recordedAt)}` : ""}` });
  } else {
    steps.push({ key: "handover", label: "Cash handed to the custodian", state: input.status === "approved" ? "waiting" : "todo", detail: input.status === "approved" ? "Waiting for Accounting to confirm the day and amount" : "After the approver" });
  }

  steps.push({
    key: "budget",
    label: "Fund budget restored in the app",
    state: closed ? "done" : "todo",
    detail: closed ? `Back to the full fund amount${input.recordedAt ? ` · ${formatDateTime(input.recordedAt)}` : ""}` : "Happens when the cash handover is confirmed",
  });
  return steps;
}
