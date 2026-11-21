import Link from "next/link";
import { Check, ChevronDown, ChevronRight, CircleAlert, Clock } from "lucide-react";

import type { TrailState, TrailStep } from "@/lib/request-trail";
import { cn } from "@/lib/utils";

// Where this page sits in the trail of one amount of petty cash, and a tap to any step that exists. It sits at the very
// top of the request, voucher and liquidation pages. On a tablet or desktop the four steps are one row; on a phone it
// is one line that opens into the list (a native <details>, so it needs no script).
const WORDS: Record<TrailState, string> = { done: "done", waiting: "waiting", stopped: "stopped", todo: "not yet" };

function Mark({ state }: { state: TrailState }) {
  const tone = {
    done: "border-emerald-600 bg-emerald-600 text-white",
    waiting: "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    stopped: "border-red-600 bg-red-600 text-white",
    todo: "border-border bg-background text-muted-foreground",
  }[state];
  return (
    <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold", tone)}>
      {state === "done" ? <Check className="size-3.5" /> : state === "stopped" ? <CircleAlert className="size-3.5" /> : state === "waiting" ? <Clock className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current opacity-50" />}
    </span>
  );
}

function Crumb({ step }: { step: TrailStep }) {
  const body = (
    <>
      <Mark state={step.state} />
      <span className="min-w-0 text-left">
        <span className={cn("block text-sm leading-tight", step.current ? "font-semibold" : step.state === "todo" ? "text-muted-foreground" : "font-medium")}>{step.label}</span>
        <span className="block truncate text-xs text-muted-foreground" title={step.detail}>
          <span className="sr-only">{WORDS[step.state]}: </span>
          {step.detail}
        </span>
      </span>
    </>
  );
  const shape = cn(
    "flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5",
    step.current && "bg-muted ring-1 ring-border",
  );
  return step.href ? (
    <Link href={step.href} aria-current={step.current ? "page" : undefined} className={cn(shape, "transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring")}>
      {body}
    </Link>
  ) : (
    <span className={cn(shape, "opacity-80")}>{body}</span>
  );
}

export function RequestTrail({ steps }: { steps: TrailStep[] | null }) {
  if (!steps || steps.length < 2) return null;
  const index = Math.max(0, steps.findIndex((step) => step.current));
  const here = steps[index];
  return (
    <nav aria-label="Request trail" className="print:hidden">
      <ol className="hidden items-center gap-1 rounded-xl border bg-card p-1.5 sm:flex">
        {steps.map((step, i) => (
          <li key={step.key} className="flex min-w-0 flex-1 items-center gap-1">
            <div className="min-w-0 flex-1"><Crumb step={step} /></div>
            {i < steps.length - 1 ? <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
          </li>
        ))}
      </ol>
      <details className="group rounded-xl border bg-card sm:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">Trail · step {index + 1} of {steps.length}</span>
            <span className="block truncate text-sm font-semibold">{here.label} <span className="font-normal text-muted-foreground">· {here.detail}</span></span>
          </span>
          <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <ol className="space-y-1 border-t p-1.5">
          {steps.map((step) => (
            <li key={step.key}><Crumb step={step} /></li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
