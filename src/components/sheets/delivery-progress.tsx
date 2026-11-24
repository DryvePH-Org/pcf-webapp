"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-checks the page while Grokbot is still working, so the result appears by itself.
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [active, router]);
  return null;
}
