import { Check, CircleAlert, Clock } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimelineState, TimelineStep } from "@/lib/replenishment-timeline";
import { cn } from "@/lib/utils";

const WORDS: Record<TimelineState, string> = { done: "done", waiting: "waiting", stopped: "stopped", todo: "not yet" };

function Mark({ state }: { state: TimelineState }) {
  const tone = {
    done: "border-emerald-600 bg-emerald-600 text-white",
    waiting: "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    stopped: "border-red-600 bg-red-600 text-white",
    todo: "border-border bg-background text-muted-foreground",
  }[state];
  return (
    <span aria-hidden className={cn("relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2", tone)}>
      {state === "done" ? <Check className="size-3.5" /> : state === "stopped" ? <CircleAlert className="size-3.5" /> : state === "waiting" ? <Clock className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current opacity-50" />}
    </span>
  );
}

// Each step of one replenishment with who did it and when, including the day the cash really changed hands.
export function ReplenishmentTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <CardDescription>Who did each step and when. The cash handover shows the real day, which can be earlier than the day it was recorded.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol aria-label="Replenishment timeline" className="space-y-0">
          {steps.map((step, index) => (
            <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
              {index < steps.length - 1 ? <span aria-hidden className="absolute top-6 bottom-0 left-3 w-0.5 -translate-x-1/2 bg-border" /> : null}
              <Mark state={step.state} />
              <div className="min-w-0 pt-0.5">
                <p className={cn("text-sm leading-tight", step.state === "todo" ? "text-muted-foreground" : "font-medium")}>{step.label}</p>
                <p className="mt-0.5 break-words text-xs text-muted-foreground">
                  <span className="sr-only">{WORDS[step.state]}: </span>
                  {step.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
