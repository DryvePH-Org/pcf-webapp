"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function SheetsRefresh({
  book = "",
  automatic = true,
}: {
  book?: string;
  automatic?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(
    async (background = false) => {
      if (document.visibilityState !== "visible") return;
      setPending(true);
      try {
        const response = await fetch("/api/sheets/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ book, background }),
        });
        const data = await response.json();
        setMessage(
          response.ok
            ? "Refresh queued. Last synced time updates when complete."
            : data.error,
        );
        router.refresh();
      } catch {
        setMessage("Refresh unavailable. Showing the last saved snapshot.");
      } finally {
        setPending(false);
      }
    },
    [book, router],
  );
  useEffect(() => {
    const poll =
      automatic || message.startsWith("Refresh queued")
        ? setInterval(() => {
            if (document.visibilityState === "visible") router.refresh();
          }, 15000)
        : undefined;
    const sync = automatic
      ? setInterval(() => void refresh(true), 90000)
      : undefined;
    return () => {
      clearInterval(poll);
      clearInterval(sync);
    };
  }, [automatic, message, refresh, router]);
  return (
    <div className="space-y-2 print:hidden">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => void refresh()}
      >
        {pending
          ? "Requesting refresh…"
          : book
            ? "Refresh workbook"
            : "Refresh all workbooks"}
      </Button>
      <p role="status" className="text-xs text-muted-foreground">
        {message ||
          (automatic ? "Background refresh runs while this page is open." : "")}
      </p>
    </div>
  );
}
