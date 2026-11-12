"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setFundSelfApproval } from "@/actions/funds";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { usePending } from "@/lib/use-single-flight";

// Per-fund switch: may this fund's custodians approve their own budget request and liquidation?
export function FundSelfApproval({ fundId, name, allowed }: { fundId: string; name: string; allowed: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending, isBusy] = usePending();

  async function apply() {
    if (isBusy()) return;
    setPending(true);
    try {
      const result = await setFundSelfApproval({ fundId, allowed: !allowed });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(allowed ? "Self-approval turned off" : "Self-approval turned on");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Could not change the setting. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button className="h-11" variant={allowed ? "default" : "outline"} onClick={() => setOpen(true)}>
        {allowed ? "Turn off self-approval" : "Allow self-approval"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={allowed ? `Turn off self-approval for ${name}?` : `Let custodians of ${name} approve their own requests?`}
        description={
          allowed
            ? "Custodians of this fund go back to needing another custodian or the fund's assigned approver for their own requests."
            : "A custodian of this fund will be able to approve her own budget request, prepare and release its voucher, and approve her own liquidation and settlement. Every one of these steps is recorded in the audit log. Vouchers at or above the approval limit still need an approver."
        }
        confirmLabel={allowed ? "Turn off" : "Allow"}
        pending={pending}
        onConfirm={() => void apply()}
      />
    </>
  );
}
