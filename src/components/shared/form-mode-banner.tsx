import { PencilLine } from "lucide-react";

import { cn } from "@/lib/utils";

// A strip at the top of a form so nobody is unsure that they are in the middle
// of filling something out (and that nothing has been sent yet).
export function FormModeBanner({
  title,
  hint,
  className,
}: {
  title: string;
  hint: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground print:hidden",
        className,
      )}
    >
      <PencilLine aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide uppercase opacity-90">
          You are filling out
        </p>
        <p className="text-base leading-tight font-semibold">{title}</p>
        <p className="mt-0.5 text-sm opacity-90">{hint}</p>
      </div>
    </div>
  );
}
