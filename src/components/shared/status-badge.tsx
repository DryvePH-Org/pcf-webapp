import { StatusPill, type Tone } from "@/components/shared/status-pill";
import {
  VOUCHER_STATUS_LABELS,
  type VoucherStatus,
} from "@/lib/voucher-status";

const TONES: Record<VoucherStatus, Tone> = {
  draft: "neutral",
  submitted: "waiting",
  released: "info",
  approved: "success",
  closed: "done",
  rejected: "danger",
  void: "neutral",
};

export function StatusBadge({
  status,
  className,
}: {
  status: VoucherStatus;
  className?: string;
}) {
  return (
    <StatusPill tone={TONES[status]} className={className}>
      {VOUCHER_STATUS_LABELS[status]}
    </StatusPill>
  );
}
