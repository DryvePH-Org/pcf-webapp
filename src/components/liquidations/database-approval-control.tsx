"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { approveLiquidationWithoutSheet } from "@/actions/liquidations";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { usePending } from "@/lib/use-single-flight";

// The approval for a fund that keeps its ledger in the database only: nothing is written to a Google Sheet.
export function DatabaseApprovalControl({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending, isBusy] = usePending();
  const [message, setMessage] = useState("");

  async function approve() {
    if (isBusy()) return;
    setPending(true);
    setMessage("");
    try {
      const result = await approveLiquidationWithoutSheet(id);
      if (!result.ok) {
        setOpen(false);
        setMessage(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Liquidation approved");
      setOpen(false);
      router.refresh();
    } catch {
      setOpen(false);
      setMessage("Could not approve the liquidation. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 print:hidden">
      <Button type="button" className="h-auto min-h-11" disabled={pending} onClick={() => setOpen(true)}>
        Approve liquidation
      </Button>
      {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Approve this liquidation?"
        description="Confirm you have reviewed the expenses and receipts. This fund keeps its ledger in the app, so nothing is written to a Google Sheet."
        confirmLabel="Approve"
        pending={pending}
        onConfirm={() => void approve()}
      />
    </div>
  );
}
