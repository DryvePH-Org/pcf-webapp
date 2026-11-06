export const REQUEST_STATUSES = ["submitted", "approved", "rejected", "cancelled", "voucher_created"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: "Awaiting custodian review",
  approved: "Approved — ready for voucher",
  rejected: "Rejected",
  cancelled: "Cancelled",
  voucher_created: "Voucher created",
};
export function requestStatusLabel(value: string) {
  return REQUEST_STATUS_LABELS[value as RequestStatus] ?? value;
}
