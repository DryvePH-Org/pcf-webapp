import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";

function deadline(releasedAt: string) {
  const time = new Date(releasedAt).getTime() + 48 * 60 * 60 * 1000;
  return { value: new Date(time).toISOString(), overdue: time <= Date.now() };
}
export function LiquidationDeadline({
  releasedAt,
  status,
}: {
  releasedAt: string | null;
  status?: string;
}) {
  if (!releasedAt || status === "approved") return null;
  const due = deadline(releasedAt);
  const submitted = status === "submitted";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge
        variant={
          submitted ? "secondary" : due.overdue ? "destructive" : "outline"
        }
      >
        {submitted
          ? "Submitted for review"
          : due.overdue
            ? "Liquidation overdue"
            : "Liquidation due"}
      </Badge>
      <span className="text-muted-foreground">
        Due {formatDateTime(due.value)} · 48 hours after cash release
      </span>
    </div>
  );
}
