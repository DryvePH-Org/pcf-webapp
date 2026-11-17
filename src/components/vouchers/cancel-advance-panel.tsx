"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CircleCheck, Clock } from "lucide-react";
import { toast } from "sonner";

import { cancelUnusedAdvance, recordCancelledAdvanceReturn } from "@/actions/vouchers";
import { MoneyText } from "@/components/shared/money-text";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime } from "@/lib/dates";
import { useGuardedTransition } from "@/lib/use-single-flight";
import { ADVANCE_CANCEL_REASONS, type AdvanceCancelReason } from "@/lib/validators/voucher";

export type AdvanceState = {
  can_cancel: boolean;
  can_record_return: boolean;
  cancelled: boolean;
  returned: boolean;
  amount: number | null;
  reason_code: string | null;
  note: string | null;
  cancelled_at: string | null;
  canceller_name: string | null;
  returned_on: string | null;
  returner_name: string | null;
};

type Dialog = "cancel" | "return" | null;

// Cancelling an advance that was never used, and recording the cash coming back.
export function CancelAdvancePanel({
  voucherId,
  amount,
  state,
  today,
  releasedOn,
}: {
  voucherId: string;
  amount: number;
  state: AdvanceState;
  today: string;
  releasedOn: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, startTransition] = useGuardedTransition();
  const [reason, setReason] = useState<AdvanceCancelReason | "">("");
  const [note, setNote] = useState("");
  const [cashBack, setCashBack] = useState<"yes" | "no" | "">("");
  const [returnedOn, setReturnedOn] = useState(today);
  const [error, setError] = useState<string | null>(null);

  function finish(message: string) {
    toast.success(message);
    setDialog(null);
    router.refresh();
  }

  function cancel() {
    if (!reason) return setError("Choose why the advance was not used.");
    if (reason === "other" && !note.trim()) return setError("Explain why in the note.");
    if (!cashBack) return setError("Say whether the cash is back in the box.");
    if (cashBack === "yes" && !returnedOn) return setError("Choose the date the cash came back.");
    setError(null);
    startTransition(async () => {
      const result = await cancelUnusedAdvance({
        voucher_id: voucherId,
        reason,
        note,
        cash_back: cashBack === "yes",
        returned_on: cashBack === "yes" ? returnedOn : undefined,
      });
      if (!result.ok) return setError(result.error);
      finish(cashBack === "yes" ? "Advance cancelled and the cash return recorded." : "Advance cancelled. The cash return is pending.");
    });
  }

  function recordReturn() {
    if (!returnedOn) return setError("Choose the date the cash came back.");
    setError(null);
    startTransition(async () => {
      const result = await recordCancelledAdvanceReturn({ voucher_id: voucherId, returned_on: returnedOn });
      if (!result.ok) return setError(result.error);
      finish("Cash return recorded.");
    });
  }

  const reasonText = state.reason_code ? ADVANCE_CANCEL_REASONS[state.reason_code as AdvanceCancelReason] ?? state.reason_code : null;

  if (state.cancelled) {
    const settled = state.returned;
    return (
      <>
        <Card className={settled ? "border-emerald-300 dark:border-emerald-800" : "border-amber-300 dark:border-amber-800"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {settled ? <CircleCheck className="size-4 text-emerald-600" aria-hidden /> : <Clock className="size-4 text-amber-600" aria-hidden />}
              {settled ? "Advance not used. Cash returned." : "Advance cancelled. Cash return pending."}
            </CardTitle>
            <CardDescription>
              {settled ? (
                <>
                  <MoneyText value={state.amount ?? amount} /> was back in the box on {state.returned_on ? formatDate(state.returned_on) : "—"}, recorded by {state.returner_name ?? "—"}.
                </>
              ) : (
                <>
                  <MoneyText value={state.amount ?? amount} /> is still with the employee. The fund counts it as cash to come back until the return is recorded.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Why: </span>
              {reasonText}
              {state.note ? ` — ${state.note}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Cancelled by {state.canceller_name ?? "—"}
              {state.cancelled_at ? ` on ${formatDateTime(state.cancelled_at)}` : ""}. The budget request was closed as cancelled.
            </p>
            {!settled && state.can_record_return ? (
              <Button
                onClick={() => {
                  setError(null);
                  setReturnedOn(today);
                  setDialog("return");
                }}
              >
                Record cash returned
              </Button>
            ) : null}
            {!settled && !state.can_record_return ? (
              <p className="text-xs text-muted-foreground">The custodian records it here once the cash is back in the box.</p>
            ) : null}
          </CardContent>
        </Card>

        {dialog === "return" ? (
          <ResponsiveDialog open onOpenChange={(open) => !open && setDialog(null)} title="Record cash returned" description={<>Confirm that <MoneyText value={state.amount ?? amount} /> is back in the box.</>}>
            <DateField value={returnedOn} onChange={setReturnedOn} min={releasedOn} max={today} disabled={pending} />
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Footer pending={pending} confirm="Record return" onClose={() => setDialog(null)} onConfirm={recordReturn} />
          </ResponsiveDialog>
        ) : null}
      </>
    );
  }

  if (!state.can_cancel) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Was this cash not used?</CardTitle>
          <CardDescription>
            Cancel the advance. The voucher stays on record, the budget request closes as cancelled, and nothing is written to the Google Sheet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              setReason("");
              setNote("");
              setCashBack("");
              setReturnedOn(today);
              setDialog("cancel");
            }}
          >
            <Ban />
            Cancel — advance not used
          </Button>
        </CardContent>
      </Card>

      {dialog === "cancel" ? (
        <ResponsiveDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title="Cancel this advance"
          description={<>Nothing is deleted. <MoneyText value={amount} /> goes back to the fund once the cash is recorded as returned.</>}
        >
          <fieldset className="space-y-2" disabled={pending}>
            <legend className="text-sm font-medium">Why was it not used?</legend>
            {(Object.keys(ADVANCE_CANCEL_REASONS) as AdvanceCancelReason[]).map((code) => (
              <label key={code} className="flex items-center gap-2 text-sm">
                <input type="radio" name="reason" value={code} checked={reason === code} onChange={() => setReason(code)} />
                {ADVANCE_CANCEL_REASONS[code]}
              </label>
            ))}
            <Label htmlFor="advance-note" className="pt-1">Note{reason === "other" ? " (required)" : " (optional)"}</Label>
            <Textarea id="advance-note" rows={2} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
          </fieldset>

          <fieldset className="space-y-2" disabled={pending}>
            <legend className="text-sm font-medium">Where is the cash now?</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="cashback" value="yes" checked={cashBack === "yes"} onChange={() => setCashBack("yes")} />
              It is back in the box
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="cashback" value="no" checked={cashBack === "no"} onChange={() => setCashBack("no")} />
              Not back yet. It is still with the employee
            </label>
            {cashBack === "yes" ? <DateField value={returnedOn} onChange={setReturnedOn} min={releasedOn} max={today} disabled={pending} /> : null}
            {cashBack === "no" ? (
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                The advance is cancelled but the return stays <strong>pending</strong>. The dashboard keeps counting <MoneyText value={amount} /> as cash to come back until you record it here.
              </p>
            ) : null}
          </fieldset>

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Footer pending={pending} confirm="Cancel advance" keep="Keep advance" onClose={() => setDialog(null)} onConfirm={cancel} destructive />
        </ResponsiveDialog>
      ) : null}
    </>
  );
}

function DateField({ value, onChange, min, max, disabled }: { value: string; onChange: (value: string) => void; min: string; max: string; disabled: boolean }) {
  return (
    <div className="space-y-1">
      <Label htmlFor="advance-returned-on">Date the cash came back</Label>
      <Input id="advance-returned-on" type="date" value={value} min={min} max={max} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Footer({ pending, confirm, keep = "Close", onClose, onConfirm, destructive = false }: { pending: boolean; confirm: string; keep?: string; onClose: () => void; onConfirm: () => void; destructive?: boolean }) {
  return (
    <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" disabled={pending} onClick={onClose}>{keep}</Button>
      <Button type="button" variant={destructive ? "destructive" : "default"} disabled={pending} onClick={onConfirm}>
        {pending ? "Saving..." : confirm}
      </Button>
    </div>
  );
}
