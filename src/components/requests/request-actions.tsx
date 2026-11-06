"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelBudgetRequest, reviewBudgetRequest } from "@/actions/budget-requests";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReasonDialog } from "@/components/shared/reason-dialog";

export function RequestActions({ id, canReview, canCancel, canCreateVoucher }: {
  id: string; canReview: boolean; canCancel: boolean; canCreateVoucher: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [pending, setPending] = useState(false);
  async function perform(action: "approve" | "reject" | "cancel", note = "") {
    setPending(true);
    try {
      const result = action === "cancel" ? await cancelBudgetRequest(id) : await reviewBudgetRequest({ id, approve: action === "approve", note });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(action === "approve" ? "Request approved. No cash has been released." : action === "reject" ? "Request rejected" : "Request cancelled");
      setDialog(null); router.refresh();
    } catch { toast.error("Could not update the request. Try again."); }
    finally { setPending(false); }
  }
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {canReview ? <><Button className="h-11" onClick={() => setDialog("approve")}>Approve request</Button><Button className="h-11" variant="outline" onClick={() => setDialog("reject")}>Reject request</Button></> : null}
      {canCreateVoucher ? <Button className="h-11" nativeButton={false} render={<Link href={`/vouchers/new?request=${id}`} />}>Create linked voucher</Button> : null}
      {canCancel ? <Button className="h-11" variant="outline" onClick={() => setDialog("cancel")}>Cancel request</Button> : null}
      <ConfirmDialog open={dialog === "approve" || dialog === "cancel"} onOpenChange={open => { if (!open) setDialog(null); }} title={dialog === "cancel" ? "Cancel budget request?" : "Approve budget request?"} description={dialog === "cancel" ? "The request will be retained in history. No voucher can be created from a cancelled request." : "This allows an assigned custodian to prepare its voucher. Voucher approval limits and cash-release checks still apply."} confirmLabel={dialog === "cancel" ? "Cancel request" : "Approve request"} pending={pending} onConfirm={() => void perform(dialog === "cancel" ? "cancel" : "approve")} />
      <ReasonDialog open={dialog === "reject"} onOpenChange={open => { if (!open) setDialog(null); }} title="Reject budget request" description="The requester will see this reason." label="Reason" confirmLabel="Reject request" pending={pending} destructive onSubmit={note => void perform("reject", note)} />
    </div>
  );
}
