import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  Hourglass,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

// One look for every status in the app: a tinted pill with an icon and a bold
// label, so state reads at a glance and never relies on colour alone.
export type Tone = "neutral" | "waiting" | "info" | "success" | "danger" | "done";

const TONES: Record<Tone, { classes: string; icon: LucideIcon }> = {
  neutral: { classes: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200", icon: CircleDashed },
  waiting: { classes: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100", icon: Clock },
  info: { classes: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100", icon: Hourglass },
  success: { classes: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100", icon: CircleCheck },
  danger: { classes: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100", icon: CircleAlert },
  done: { classes: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-100", icon: CircleCheck },
};

export function StatusPill({
  tone,
  children,
  icon,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const { classes, icon: DefaultIcon } = TONES[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-none font-semibold whitespace-nowrap",
        classes,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}
