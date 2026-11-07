import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type CalloutTone = "info" | "warning" | "danger" | "success" | "neutral";

const TONES: Record<CalloutTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40", icon: "text-sky-700 dark:text-sky-300", Icon: Info },
  warning: { box: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40", icon: "text-amber-700 dark:text-amber-300", Icon: TriangleAlert },
  danger: { box: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40", icon: "text-red-700 dark:text-red-300", Icon: CircleAlert },
  success: { box: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40", icon: "text-emerald-700 dark:text-emerald-300", Icon: CircleCheck },
  neutral: { box: "border-border bg-muted/50", icon: "text-muted-foreground", Icon: Info },
};

// A message that has to be seen: what happened or what to do next, up front.
export function Callout({
  tone = "info",
  title,
  children,
  icon,
  className,
}: {
  tone?: CalloutTone;
  title: string;
  children?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const { box, icon: iconClass, Icon: DefaultIcon } = TONES[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border-l-4 border p-4 print:hidden", box, className)}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", iconClass)} aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-sm leading-snug font-semibold">{title}</p>
        {children ? (
          <div className="text-sm leading-relaxed text-foreground/80">{children}</div>
        ) : null}
      </div>
    </div>
  );
}
