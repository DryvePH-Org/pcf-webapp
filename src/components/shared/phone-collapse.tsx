"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// A long block that is closed behind a heading on a phone and always open on a tablet, desktop and paper.
// A link to "#<anchor>" (the page's own section buttons) opens it.
export function PhoneCollapse({ anchor, title, hint, children }: { anchor: string; title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      if (window.location.hash !== `#${anchor}`) return;
      setOpen(true);
      requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [anchor]);
  const panel = `${anchor}-panel`;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(value => !value)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 text-left sm:hidden print:hidden"
      >
        <span className="min-w-0">
          <span className="block font-medium">{title}</span>
          {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
        </span>
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <div id={panel} className={`${open ? "mt-4 block" : "hidden"} sm:mt-0 sm:block print:mt-0 print:block`}>
        {children}
      </div>
    </div>
  );
}
