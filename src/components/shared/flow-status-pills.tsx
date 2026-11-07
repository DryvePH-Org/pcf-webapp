import { StatusPill, type Tone } from "@/components/shared/status-pill";
import { LIQUIDATION_LABELS } from "@/lib/liquidation";
import { requestStatusLabel } from "@/lib/request-status";

const REQUEST_TONES: Record<string, Tone> = {
  submitted: "waiting",
  approved: "info",
  voucher_created: "success",
  rejected: "danger",
  cancelled: "neutral",
};

const LIQUIDATION_TONES: Record<string, Tone> = {
  draft: "neutral",
  submitted: "waiting",
  flagged: "danger",
  approved: "success",
};

export function RequestStatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <StatusPill tone={REQUEST_TONES[status] ?? "neutral"} className={className}>
      {requestStatusLabel(status)}
    </StatusPill>
  );
}

export function LiquidationStatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <StatusPill tone={LIQUIDATION_TONES[status] ?? "neutral"} className={className}>
      {LIQUIDATION_LABELS[status] ?? status}
    </StatusPill>
  );
}
