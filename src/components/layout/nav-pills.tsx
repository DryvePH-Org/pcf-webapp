import type { NavIndicator } from "@/lib/nav-indicators";
import { cn } from "@/lib/utils";

// Beside a menu entry: an amber number is work the person still has to do and stays until it is done; a blue number is
// news to look at and goes away once the page is opened.
export function NavPills({ indicator }: { indicator?: NavIndicator }) {
  if (!indicator || (!indicator.action && !indicator.seen)) return null;
  return (
    <span className="ml-auto flex items-center gap-1">
      {indicator.seen > 0 ? (
        <span
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-sky-600 px-1.5 text-xs font-semibold text-white"
          aria-label={`${indicator.seen} new to see`}
        >
          {indicator.seen}
        </span>
      ) : null}
      {indicator.action > 0 ? (
        <span
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-amber-950"
          aria-label={`${indicator.action} waiting for you`}
        >
          {indicator.action}
        </span>
      ) : null}
    </span>
  );
}

// A small dot for the phone's bottom bar: amber when something needs doing, blue when it is only news.
export function NavDot({ indicator, className }: { indicator?: NavIndicator; className?: string }) {
  if (!indicator || (!indicator.action && !indicator.seen)) return null;
  const action = indicator.action > 0;
  return (
    <span
      className={cn("size-2.5 rounded-full", action ? "bg-amber-500" : "bg-sky-600", className)}
      aria-label={action ? "waiting for you" : "new to see"}
    />
  );
}
