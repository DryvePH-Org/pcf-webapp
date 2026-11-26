"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { correctLiquidation, previewLiquidationCorrection, type CorrectionPreview } from "@/actions/admin-corrections";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePending } from "@/lib/use-single-flight";

// Administrators only: send a submitted or approved liquidation back to its owner, or delete it, so it can be done
// again. Needs the administrator's own password and a written reason, and is logged.
export function LiquidationCorrection({ id, pcv, status }: { id: string; pcv: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [mode, setMode] = useState<"draft" | "delete">("draft");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy, isBusy] = usePending();

  async function openDialog() {
    setError("");
    setPassword("");
    setPreview(null);
    setOpen(true);
    const result = await previewLiquidationCorrection(id).catch(() => null);
    if (!result) setError("Could not check this liquidation. Close this and try again.");
    else if (!result.ok) setError(result.error);
    else setPreview(result.preview);
  }

  async function confirm() {
    if (isBusy()) return;
    setError("");
    setBusy(true);
    try {
      const result = await correctLiquidation({ id, mode, reason, password });
      if (!result.ok) {
        setError(result.error);
        setPassword("");
        return;
      }
      setOpen(false);
      toast.success(
        result.mode === "delete"
          ? `${result.pcv}: the liquidation was deleted. The owner can liquidate it again.`
          : `${result.pcv}: sent back to the owner as a draft.`,
      );
      if (result.inSheet) toast.message("It was written to the Google Sheet. Ask Grokbot to clear its rows (see the user guide).", { duration: 12000 });
      if (result.mode === "delete") router.push("/liquidations");
      else router.refresh();
    } catch {
      setError("Could not complete it. Check the liquidation before trying again.");
    } finally {
      setBusy(false);
    }
  }

  const blocked = (preview?.blockers.length ?? 0) > 0;
  const ready = Boolean(preview) && !blocked && reason.trim().length >= 5 && password.length > 0;
  return (
    <Card className="print:hidden border-amber-300 dark:border-amber-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert aria-hidden className="size-4" />
          Administrator correction
        </CardTitle>
        <CardDescription>
          Filed wrongly? Send it back to its owner to be done again, or delete it. You confirm with your password and a reason, and it is logged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" onClick={() => void openDialog()}>
          Send back or delete…
        </Button>
      </CardContent>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => !busy && setOpen(next)}
        title={`Correct ${pcv}`}
        description={`This liquidation is ${status}. Choose what to do.`}
        confirmLabel={mode === "delete" ? "Delete liquidation" : "Send back as draft"}
        destructive={mode === "delete"}
        pending={busy}
        onConfirm={() => {
          if (!ready) {
            setError(blocked ? "Fix what is stopping it first." : "Write the reason and type your password.");
            return;
          }
          void confirm();
        }}
      >
        <div className="space-y-4">
          {preview ? (
            <div className="space-y-2 text-sm">
              <p>
                {preview.owner} · spent {preview.spent.toLocaleString("en-PH", { style: "currency", currency: "PHP" })}
              </p>
              {preview.in_sheet ? <p className="text-muted-foreground">It was written to the Google Sheet. The app forgets that job; the rows in the sheet are cleared by Grokbot afterwards.</p> : null}
              {blocked ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {preview.blockers.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : !error ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : null}
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-sm font-medium">What to do</legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" name="correction-mode" className="mt-1" checked={mode === "draft"} onChange={() => setMode("draft")} />
              <span>
                <span className="font-medium">Send back as a draft.</span> The lines and pictures stay; the owner fixes them and submits again. The review and approval are removed.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" name="correction-mode" className="mt-1" checked={mode === "delete"} onChange={() => setMode("delete")} />
              <span>
                <span className="font-medium">Delete it.</span> Everything in it is removed. The advance is outstanding again and the owner starts a new liquidation.
              </span>
            </label>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="correction-reason">Reason</Label>
            <Textarea id="correction-reason" rows={2} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="correction-password">Your password</Label>
            <Input id="correction-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </ConfirmDialog>
    </Card>
  );
}
