"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isOutOfDate, UPDATE_CHECK_MS, UPDATE_SNOOZE_MS } from "@/lib/update-notice";

// "A new version is ready". After an update, a page that was left open can no longer talk to the app and its
// forms fail with a generic error. This tells the person before that happens. It never reloads by itself: they
// finish what they are doing first. Liquidation drafts save themselves, so a reload loses nothing there.
export function UpdateBanner({ loadedId }: { loadedId: string }) {
  const [outOfDate, setOutOfDate] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const checking = useRef(false);

  useEffect(() => {
    if (!loadedId) return;
    async function check() {
      if (checking.current || document.visibilityState !== "visible") return;
      checking.current = true;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { id?: string };
        setOutOfDate(isOutOfDate(loadedId, data.id));
      } catch {
        // offline or briefly unreachable: ask again later
      } finally {
        checking.current = false;
      }
    }
    const timer = setInterval(() => void check(), UPDATE_CHECK_MS);
    const soon = () => void check();
    window.addEventListener("focus", soon);
    window.addEventListener("online", soon);
    document.addEventListener("visibilitychange", soon);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", soon);
      window.removeEventListener("online", soon);
      document.removeEventListener("visibilitychange", soon);
    };
  }, [loadedId]);

  // "Later" hides it for a few minutes; if the page is still out of date it comes back
  useEffect(() => {
    if (!snoozed) return;
    const timer = setTimeout(() => setSnoozed(false), UPDATE_SNOOZE_MS);
    return () => clearTimeout(timer);
  }, [snoozed]);

  if (!outOfDate || snoozed) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-xl border border-sky-300 bg-sky-50 p-4 text-sky-950 shadow-lg sm:flex-row sm:items-center sm:justify-between lg:bottom-4 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-50 print:hidden"
    >
      <p className="text-sm">
        <span className="font-semibold">A new version of the app is ready.</span> Finish what you are typing, then reload so everything keeps working. Liquidation drafts save themselves.
      </p>
      <span className="flex shrink-0 gap-2">
        <Button type="button" onClick={() => window.location.reload()}>
          <RefreshCw />
          Reload now
        </Button>
        <Button type="button" variant="outline" onClick={() => setSnoozed(true)}>
          Later
        </Button>
      </span>
    </div>
  );
}
