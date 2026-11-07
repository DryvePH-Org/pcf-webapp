import { StatusPill, type Tone } from "@/components/shared/status-pill";
import {
  REPLENISHMENT_STATUS_LABELS,
  type ReplenishmentStatus,
} from "@/lib/replenishment-status";

const TONES: Record<ReplenishmentStatus, Tone> = {
  draft: "neutral",
  submitted: "waiting",
  approved: "success",
  rejected: "danger",
  closed: "done",
};

export function ReplenishmentStatusBadge({
  status,
  className,
}: {
  status: ReplenishmentStatus;
  className?: string;
}) {
  return (
    <StatusPill tone={TONES[status]} className={className}>
      {REPLENISHMENT_STATUS_LABELS[status]}
    </StatusPill>
  );
}
