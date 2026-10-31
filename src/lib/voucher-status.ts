export const VOUCHER_STATUSES = [
  "draft",
  "released",
  "approved",
  "closed",
  "rejected",
  "void",
] as const;

export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  draft: "Draft",
  released: "Released",
  approved: "Approved",
  closed: "Closed",
  rejected: "Flagged",
  void: "Void",
};

export function isVoucherStatus(value: string | undefined): value is VoucherStatus {
  return (
    value !== undefined &&
    (VOUCHER_STATUSES as readonly string[]).includes(value)
  );
}
