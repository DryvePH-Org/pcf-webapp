"use client";
import { SheetApprovalControl } from "@/components/sheets/approval-control";
import { useState } from "react";
import { usePending } from "@/lib/use-single-flight";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { approveLiquidationReimbursement, recordLiquidationSettlement, reviewLiquidation } from "@/actions/liquidations";
import { formatPHP } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReasonDialog } from "@/components/shared/reason-dialog";
export function LiquidationActions({ id, canReview, canPrepareApproval = true, canApproveReimbursement, canSettle, kind, amount }: { id: string; canReview: boolean; canPrepareApproval?: boolean; canApproveReimbursement: boolean; canSettle: boolean; kind: string; amount: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"approve" | "flag" | "settle" | "reimburse" | null>(null);
  const [pending, setPending, isBusy] = usePending();
  const [note, setNote] = useState("");
  async function perform(action: string, reason = "") {
    if (isBusy()) return;
    setPending(true);
    try {
      const result = action === "settle" ? await recordLiquidationSettlement({ id, amount, note }) : action === "reimburse" ? await approveLiquidationReimbursement(id) : await reviewLiquidation({ id, approve: action === "approve", note: reason });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(action === "settle" ? "Actual cash settlement recorded" : action === "reimburse" ? "Additional reimbursement approved" : action === "approve" ? "Liquidation approved — cash is unchanged" : "Liquidation flagged for correction");
      setDialog(null); router.refresh();
    } catch { toast.error("Could not complete the action. Try again."); }
    finally { setPending(false); }
  }
  return <div className="space-y-3 print:hidden">
    {canSettle ? <div className="space-y-2"><Label htmlFor="settlement-note">Settlement note (optional)</Label><Textarea id="settlement-note" maxLength={300} value={note} onChange={e => setNote(e.target.value)} disabled={pending} /></div> : null}
    {canReview ? <section aria-label="Custodian review actions" className="space-y-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
      <div>
        <h2 className="text-base font-semibold">Your review: choose what to do</h2>
        <p className="text-sm text-muted-foreground">{canPrepareApproval ? "Approve this liquidation, or send it back so the employee can fix it." : "Check the receipts, save your review, then approve. Or send it back so the employee can fix it."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {canPrepareApproval ? <SheetApprovalControl id={id}/> : <Button className="h-12 px-5 text-base" nativeButton={false} render={<a href="#receipt-review" />}>Review receipts and approve</Button>}
        <Button disabled={pending} variant="destructive" className="h-12 px-5 text-base font-semibold" onClick={() => setDialog("flag")}>Flag for correction</Button>
      </div>
    </section> : null}
    <div className="flex flex-wrap gap-2">
      {canApproveReimbursement ? <Button disabled={pending} className="h-11" onClick={() => setDialog("reimburse")}>Approve additional reimbursement</Button> : null}
      {canSettle ? <Button disabled={pending} className="h-11" onClick={() => setDialog("settle")}>{kind === "return" ? "Record cash received back" : "Record reimbursement paid"}</Button> : null}
    </div>
    <ConfirmDialog open={dialog !== null && dialog !== "flag"} onOpenChange={open => { if (!open) setDialog(null); }} title={dialog === "settle" ? "Confirm actual cash movement" : dialog === "reimburse" ? "Approve additional reimbursement?" : "Approve liquidation?"} description={dialog === "settle" ? `Confirm ${formatPHP(amount)} has actually been ${kind === "return" ? "received back into the fund" : "paid to the employee"}. This changes expected cash and cannot be recorded twice.` : dialog === "reimburse" ? "This authorizes the additional payment. Cash changes only when a custodian records payment." : "Confirm that expenses and supporting documents match. This approval does not change cash."} confirmLabel={dialog === "settle" ? "Confirm cash recorded" : "Approve"} pending={pending} onConfirm={() => void perform(dialog ?? "approve")} />
    <ReasonDialog open={dialog === "flag"} onOpenChange={open => { if (!open) setDialog(null); }} title="Flag liquidation" description="Explain what the employee must correct." label="Reason" confirmLabel="Flag for correction" pending={pending} onSubmit={reason => void perform("flag", reason)} />
  </div>;
}
