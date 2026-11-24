"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Keeps the queue current while something is still moving, only while the page is open and visible.
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [active, router]);
  return null;
}
