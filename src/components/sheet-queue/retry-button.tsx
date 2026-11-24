"use client";

import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";

import { retrySheetJob } from "@/actions/sheet-queue";
import { Button } from "@/components/ui/button";
import { usePending } from "@/lib/use-single-flight";

export function RetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy, isBusy] = usePending();
  async function retry() {
    if (isBusy()) return;
    setBusy(true);
    try {
      const result = await retrySheetJob(id);
      if (result.ok) {
        toast.success("Sent to the queue again.");
        router.refresh();
      } else toast.error(result.error);
    } catch {
      toast.error("Could not retry. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void retry()}>
      <RotateCw />
      {busy ? "Working…" : "Retry"}
    </Button>
  );
}
