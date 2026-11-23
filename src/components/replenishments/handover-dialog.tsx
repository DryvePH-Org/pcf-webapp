"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPHP } from "@/lib/money";
import { parseMoney } from "@/lib/money";
import { useClickLatch } from "@/lib/use-single-flight";

export type HandoverInput = { handedOverOn: string; amount: string; note: string };

// Accounting confirms the cash handover: the day the cash really changed hands (it can be earlier than today when the
// approvals were recorded late) and how much was handed over. A different amount needs a note.
export function HandoverDialog({
  open,
  onOpenChange,
  total,
  today,
  prepared,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: string;
  today: string;
  prepared: string;
  pending: boolean;
  onSubmit: (input: HandoverInput) => void;
}) {
  const id = useId();
  const [on, setOn] = useState(today);
  const [amount, setAmount] = useState(Number(total).toFixed(2));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { once, release } = useClickLatch();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) release();
    wasPending.current = pending;
  }, [pending, release]);

  const cents = parseMoney(amount);
  const differs = cents !== null && cents !== Math.round(Number(total) * 100);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Confirm the cash handed to the custodian"
      description={`The included vouchers become closed and the fund's budget comes back in the app. This cannot be undone. Approved amount: ${formatPHP(total)}.`}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${id}-on`}>Day the cash was handed over</Label>
          <Input id={`${id}-on`} type="date" min={prepared} max={today} value={on} disabled={pending} onChange={(event) => { setOn(event.target.value); setError(null); }} />
          <p className="text-xs text-muted-foreground">Today by default. Choose the earlier day if the cash went out before the approvals were recorded.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-amount`}>Amount handed over (₱)</Label>
          <Input id={`${id}-amount`} inputMode="decimal" className="text-right tabular-nums" value={amount} disabled={pending} onChange={(event) => { setAmount(event.target.value); setError(null); }} />
        </div>
        {differs ? (
          <div className="space-y-2">
            <Label htmlFor={`${id}-note`}>Why is it different from {formatPHP(total)}?</Label>
            <Textarea id={`${id}-note`} rows={3} maxLength={300} value={note} disabled={pending} placeholder="Example: ₱50 kept for the bank fee." onChange={(event) => { setNote(event.target.value); setError(null); }} />
          </div>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
      <div className="-mx-4 -mb-4 mt-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!on) return setError("Choose the day the cash was handed over.");
            if (cents === null || cents <= 0) return setError("Enter the amount handed over, greater than zero with at most two decimals.");
            if (differs && !note.trim()) return setError("Explain why the amount is different from the approved amount.");
            once(() => onSubmit({ handedOverOn: on, amount: amount.trim(), note: note.trim() }));
          }}
        >
          {pending ? "Working..." : "Confirm cash handed over"}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
