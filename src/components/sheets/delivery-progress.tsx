"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/shared/status-pill";

export function SheetDeliveryProgress({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [pending, router]);
  return (
    <StatusPill tone={pending ? "waiting" : "success"}>
      {pending ? "Grokbot encoding pending" : "Encoding verified"}
    </StatusPill>
  );
}
