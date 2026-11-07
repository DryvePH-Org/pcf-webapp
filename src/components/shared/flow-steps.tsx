import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type FlowStep = {
  label: string;
  state: "done" | "current" | "todo" | "stopped";
  hint?: string;
};

// Where this item sits in the money trail (request, voucher, liquidation,
// settlement), so nobody has to guess what comes next.
export function FlowSteps({ steps, label = "Progress" }: { steps: FlowStep[]; label?: string }) {
  return (
    <ol
      aria-label={label}
      className="grid gap-3 rounded-xl border bg-card p-4 sm:flex sm:items-start sm:gap-0 print:hidden"
    >
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === "current" ? "step" : undefined}
          className="relative flex min-w-0 flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
        >
          {index > 0 ? (
            <span
              aria-hidden
              className={cn(
                "absolute top-4 right-1/2 hidden h-0.5 w-full sm:block",
                steps[index - 1].state === "done" ? "bg-emerald-500" : "bg-border",
              )}
            />
          ) : null}
          <span
            className={cn(
              "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
              step.state === "done" && "border-emerald-600 bg-emerald-600 text-white",
              step.state === "current" && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
              step.state === "todo" && "border-border bg-background text-muted-foreground",
              step.state === "stopped" && "border-red-600 bg-red-600 text-white",
            )}
          >
            {step.state === "done" ? <Check className="size-4" aria-hidden /> : step.state === "stopped" ? "!" : index + 1}
          </span>
          <span className="min-w-0">
            <span
              className={cn(
                "block text-sm leading-tight",
                step.state === "todo" ? "text-muted-foreground" : "font-semibold",
              )}
            >
              {step.label}
            </span>
            {step.hint ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">{step.hint}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
