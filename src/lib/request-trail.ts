import { liquidationDifference } from "@/lib/liquidation";

// The trail of one request: budget request > voucher (cash released) > liquidation > settlement.
// This file only decides what each step says and where it links; loading the records is in request-trail-data.ts.
export type TrailInput = {
  request: { id: string; ref: string; status: string } | null;
  voucher: { id: string; pcv: string; status: string; released: boolean } | null;
  liquidation: { id: string; status: string; received: string; spent: string } | null;
  settlement: { kind: string; amount: string } | null;
};
export type TrailKey = "request" | "voucher" | "liquidation" | "settlement";
export type TrailState = "done" | "waiting" | "stopped" | "todo";
export type TrailStep = {
  key: TrailKey;
  label: string;
  // the record's own number or a short status, shown under the label
  detail: string;
  state: TrailState;
  href: string | null;
  current: boolean;
};

const peso = (value: string) => `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildRequestTrail(input: TrailInput, here: TrailKey): TrailStep[] {
  const { request, voucher, liquidation, settlement } = input;
  const steps: TrailStep[] = [];

  if (request) {
    const stopped = request.status === "rejected" || request.status === "cancelled";
    const waiting = request.status === "submitted" || request.status === "awaiting_approver";
    steps.push({
      key: "request",
      label: "Budget request",
      detail: stopped ? (request.status === "rejected" ? "Rejected" : "Cancelled") : request.status === "awaiting_approver" ? "Awaiting the approver" : waiting ? "Awaiting review" : request.ref,
      state: stopped ? "stopped" : waiting ? "waiting" : "done",
      href: `/requests/${request.id}`,
      current: here === "request",
    });
  }

  const requestOpen = request ? ["submitted", "awaiting_approver", "rejected", "cancelled"].includes(request.status) : false;
  if (voucher) {
    const stopped = voucher.status === "rejected" || voucher.status === "void";
    steps.push({
      key: "voucher",
      label: "Voucher",
      detail: voucher.status === "void" ? "Void" : voucher.status === "rejected" ? "Flagged" : voucher.released ? `${voucher.pcv} · cash released` : voucher.status === "submitted" ? `${voucher.pcv} · awaiting approval` : `${voucher.pcv} · not released yet`,
      state: stopped ? "stopped" : voucher.released ? "done" : "waiting",
      href: `/vouchers/${voucher.id}`,
      current: here === "voucher",
    });
  } else {
    steps.push({
      key: "voucher",
      label: "Voucher",
      detail: request && !requestOpen ? "To be prepared" : "Not yet",
      state: "todo",
      href: null,
      current: false,
    });
  }

  const cashOut = Boolean(voucher?.released);
  if (liquidation) {
    const stopped = liquidation.status === "flagged";
    const done = liquidation.status === "approved";
    steps.push({
      key: "liquidation",
      label: "Liquidation",
      detail: done ? "Approved" : stopped ? "Needs correction" : liquidation.status === "submitted" ? "Awaiting custodian review" : "Draft, not submitted",
      state: done ? "done" : stopped ? "stopped" : "waiting",
      href: `/liquidations/${liquidation.id}`,
      current: here === "liquidation",
    });
  } else {
    steps.push({
      key: "liquidation",
      label: "Liquidation",
      detail: cashOut ? "Not filed yet" : "After the cash is released",
      state: cashOut ? "waiting" : "todo",
      href: null,
      current: false,
    });
  }

  if (liquidation?.status === "approved") {
    const difference = liquidationDifference(liquidation.received, liquidation.spent);
    const settled = Boolean(settlement) || difference.kind === "none";
    steps.push({
      key: "settlement",
      label: "Settlement",
      detail: difference.kind === "none" ? "Nothing to settle" : settlement ? `${settlement.kind === "return" ? "Cash returned" : "Reimbursed"} ${peso(settlement.amount)}` : `${difference.kind === "return" ? "Cash to return" : "Reimbursement due"} ${peso(difference.amount)}`,
      state: settled ? "done" : "waiting",
      href: `/liquidations/${liquidation.id}#settlement`,
      current: here === "settlement",
    });
  } else {
    steps.push({
      key: "settlement",
      label: "Settlement",
      detail: liquidation ? "After the review" : "Last step",
      state: "todo",
      href: null,
      current: false,
    });
  }
  return steps;
}

// Where the whole trail stands, in one short line for a list: the first step that is not done yet.
export function stageLabel(steps: TrailStep[]): string {
  const next = steps.find((step) => step.state !== "done");
  return next ? `${next.label}: ${next.detail}` : "Everything settled";
}
