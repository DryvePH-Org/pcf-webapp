"use client";

import { formatDate } from "@/lib/dates";
import { ReceiptAttachment } from "./receipt-attachment";
import { MAX_EXTRA_PICTURES, MorePictures } from "./more-pictures";
import { useEffect, useRef, useState } from "react";
import { usePending } from "@/lib/use-single-flight";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveLiquidation } from "@/actions/liquidations";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MoneyText } from "@/components/shared/money-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { openLiquidationReceipt, uploadLiquidationReceipt } from "@/lib/liquidation-receipts";
import { FormModeBanner } from "@/components/shared/form-mode-banner";
import { NaButton } from "@/components/shared/na-button";
import { parseMoney } from "@/lib/money";
import { browserStore, clearBackup, normalizeForm, restorable, saveBackup } from "@/lib/liquidation-backup";
import {
  saveLiquidationSchema,
  submitLiquidationSchema,
  type LiquidationFormValues,
  type LiquidationLine,
} from "@/lib/validators/liquidation";

export function LiquidationForm({
  initial,
  received,
  employeeName,
}: {
  initial: LiquidationFormValues;
  received: string;
  employeeName: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, setPending, isBusy] = usePending();
  const [uploading, setUploading] = useState<string | null>(null);
  // What is typed here is also saved by itself (to the server, and on this device), because the page can reload
  // on its own, for example when a phone comes back from the camera.
  const savedRef = useRef(initial);
  const hydrated = useRef(false);
  const [restored, setRestored] = useState(false);
  const [auto, setAuto] = useState<"idle" | "saving" | "saved" | "kept">("idle");
  const [autoAt, setAutoAt] = useState("");
  useEffect(() => {
    // after the first paint, so the page and the browser agree on what was drawn
    const timer = setTimeout(() => {
      const back = restorable(browserStore(), initial);
      if (back) {
        setForm(back);
        setRestored(true);
      }
    }, 0);
    return () => clearTimeout(timer);
    // only when the form first opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    if (normalizeForm(form) === normalizeForm(savedRef.current)) clearBackup(browserStore(), form.id);
    else saveBackup(browserStore(), form, savedRef.current);
  }, [form]);
  useEffect(() => {
    if (normalizeForm(form) === normalizeForm(savedRef.current)) return;
    const timer = setTimeout(async () => {
      if (isBusy() || uploading !== null) return;
      const parsed = saveLiquidationSchema.safeParse(form);
      if (!parsed.success) {
        setAuto("kept");
        return;
      }
      setAuto("saving");
      try {
        const result = await saveLiquidation(parsed.data, false, true);
        if (!result.ok) {
          setAuto("kept");
          return;
        }
        savedRef.current = form;
        setAuto("saved");
        setAutoAt(new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }));
        clearBackup(browserStore(), form.id);
      } catch {
        setAuto("kept");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [form, uploading, isBusy]);
  const [uploadFailed, setUploadFailed] = useState<Record<string, string>>({});
  const clearFailed = (lineId: string) =>
    setUploadFailed((current) => {
      const next = { ...current };
      delete next[lineId];
      return next;
    });
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<string | null>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const disabled = pending || uploading !== null;
  const spent = form.items.reduce(
    (sum, item) => sum + (parseMoney(item.amount) ?? 0),
    0,
  );
  const difference = (parseMoney(received) ?? 0) - spent;
  function updateLine(index: number, patch: Partial<LiquidationLine>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    }));
  }
  // The buttons are at the bottom of a long form and the message used to appear at the top, out of sight, so
  // the buttons looked dead. Say it in a toast, put it beside the field, and bring it into view.
  function showError(message: string, field?: PropertyKey) {
    setError(message);
    setErrorField(typeof field === "string" ? field : null);
    toast.error(message);
    requestAnimationFrame(() => {
      const input = field === "department" ? document.getElementById("liquidation-department") : null;
      if (input) {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        input.focus({ preventScroll: true });
      } else errorBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  async function save(submit: boolean) {
    const parsed = (
      submit ? submitLiquidationSchema : saveLiquidationSchema
    ).safeParse(form);
    if (!parsed.success) {
      showError(parsed.error.issues[0].message, parsed.error.issues[0].path[0]);
      return;
    }
    if (isBusy()) return;
    setPending(true);
    setError("");
    setErrorField(null);
    try {
      const result = await saveLiquidation(parsed.data, submit);
      if (!result.ok) {
        // Close the confirmation so the reason is not hidden behind it.
        setConfirm(false);
        showError(result.error);
        return;
      }
      savedRef.current = form;
      clearBackup(browserStore(), form.id);
      toast.success(
        submit ? "Submitted to the custodian" : "Liquidation draft saved",
      );
      setConfirm(false);
      router.refresh();
    } catch {
      setConfirm(false);
      setError("Could not save the liquidation. Try again.");
    } finally {
      setPending(false);
    }
  }
  function reviewSubmission() {
    const parsed = submitLiquidationSchema.safeParse(form);
    if (!parsed.success) {
      showError(parsed.error.issues[0].message, parsed.error.issues[0].path[0]);
      return;
    }
    setError("");
    setErrorField(null);
    setConfirm(true);
  }
  return (
    <Card className="overflow-visible print:hidden">
      <CardHeader>
        <CardTitle>Requester liquidation</CardTitle>
      </CardHeader>
      <CardContent>
        {restored ? (
          <Alert className="mb-5">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>The page reloaded, so we brought back what you were typing, receipts included.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setForm(initial);
                  savedRef.current = initial;
                  clearBackup(browserStore(), initial.id);
                  setRestored(false);
                }}
              >
                Start over from the saved version
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <FormModeBanner
          title="Liquidation form"
          hint="Enter what you actually spent. Nothing goes to your custodian until you press Submit for review."
          className="mb-5"
        />
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <p className="text-sm text-muted-foreground">
            Enter the actual amounts and attach any receipts you have.
          </p>
          {error ? (
            <div ref={errorBox}>
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : null}
          <fieldset disabled={disabled} className="min-w-0 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="liquidation-name">Name</Label>
                <Input id="liquidation-name" value={employeeName} readOnly />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Filing date</p>
                <p className="rounded-md bg-muted px-3 py-2 text-sm">
                  {formatDate(initial.filing_date)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Fixed when this form was created.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="liquidation-department">Department <span className="font-normal text-muted-foreground">(needed to submit)</span></Label>
                <Input
                  id="liquidation-department"
                  maxLength={100}
                  value={form.department}
                  aria-invalid={errorField === "department"}
                  onChange={(event) =>
                    setForm({ ...form, department: event.target.value })
                  }
                />
                {errorField === "department" ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : null}
              </div>
            </div>
            {form.items.map((item, index) => (
              <div key={item.id} className="space-y-4 rounded-lg border p-4">
                <div className="flex justify-between gap-2">
                  <h3 className="font-medium">Particular {index + 1}</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm({
                        ...form,
                        items: form.items.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 />
                    Remove
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`particulars-${item.id}`}>Particulars</Label>
                  <Textarea
                    id={`particulars-${item.id}`}
                    maxLength={300}
                    value={item.particulars}
                    onChange={(event) =>
                      updateLine(index, { particulars: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`amount-${item.id}`}>Amount actually spent (₱)</Label>
                    <Input
                      id={`amount-${item.id}`}
                      inputMode="decimal"
                      maxLength={13}
                      className="text-right tabular-nums"
                      placeholder="0.00"
                      value={item.amount}
                      onChange={(event) =>
                        updateLine(index, { amount: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`plate-${item.id}`}>
                        Plate number (optional)
                      </Label>
                      <NaButton
                        value={item.sheet_details?.plate ?? ""}
                        onChange={(plate) =>
                          updateLine(index, { sheet_details: { plate } })
                        }
                      />
                    </div>
                    <Input
                      id={`plate-${item.id}`}
                      maxLength={300}
                      value={item.sheet_details?.plate ?? ""}
                      onChange={(event) =>
                        updateLine(index, {
                          sheet_details: { plate: event.target.value },
                        })
                      }
                    />
                  </div>
                </div>
                <ReceiptAttachment
                  id={`receipt-${item.id}`}
                  attached={Boolean(item.receipt_path)}
                  uploading={uploading === item.id}
                  failed={uploadFailed[item.id] ?? null}
                  onView={() =>
                    void openLiquidationReceipt(
                      item.receipt_path,
                      previews[item.id],
                    ).catch((problem) =>
                      toast.error(
                        problem instanceof Error
                          ? problem.message
                          : "Could not open the attachment.",
                      ),
                    )
                  }
                  onRemove={() => {
                    clearFailed(item.id);
                    // the next picture becomes the main one, so nothing else is lost
                    const [next, ...rest] = item.extra_photos;
                    updateLine(index, { receipt_path: next ?? "", extra_photos: rest });
                  }}
                  onChoose={async (file) => {
                    setUploading(item.id);
                    setError("");
                    clearFailed(item.id);
                    try {
                      const path = await uploadLiquidationReceipt(
                        file,
                        form.id,
                        item.id,
                      );
                      updateLine(index, {
                        receipt_path: path,
                        no_receipt_reason: "",
                      });
                      setPreviews((current) => ({
                        ...current,
                        [item.id]: URL.createObjectURL(file),
                      }));
                    } catch (problem) {
                      const message =
                        problem instanceof Error
                          ? problem.message
                          : "Upload failed.";
                      setUploadFailed((current) => ({
                        ...current,
                        [item.id]: message,
                      }));
                      setError(message);
                    } finally {
                      setUploading(null);
                    }
                  }}
                />
                {item.receipt_path ? (
                  <MorePictures
                    id={`more-${item.id}`}
                    paths={item.extra_photos}
                    busy={uploading === item.id}
                    disabled={disabled}
                    onView={(path) =>
                      void openLiquidationReceipt(path, previews[path]).catch((problem) =>
                        toast.error(problem instanceof Error ? problem.message : "Could not open the picture."),
                      )
                    }
                    onRemove={(path) =>
                      updateLine(index, { extra_photos: item.extra_photos.filter((other) => other !== path) })
                    }
                    onAdd={async (files) => {
                      const room = MAX_EXTRA_PICTURES - item.extra_photos.length;
                      if (files.length > room) toast.message(`Only ${room} more can be added to this line. The rest were skipped.`);
                      setUploading(item.id);
                      setError("");
                      clearFailed(item.id);
                      const added: string[] = [];
                      try {
                        for (const file of files.slice(0, room)) {
                          const path = await uploadLiquidationReceipt(file, form.id, item.id);
                          added.push(path);
                          setPreviews((current) => ({ ...current, [path]: URL.createObjectURL(file) }));
                        }
                      } catch (problem) {
                        const message = problem instanceof Error ? problem.message : "Upload failed.";
                        setUploadFailed((current) => ({ ...current, [item.id]: message }));
                        setError(message);
                      } finally {
                        // keep whatever did upload, even if a later one failed
                        if (added.length)
                          setForm((current) => ({
                            ...current,
                            items: current.items.map((line) =>
                              line.id === item.id ? { ...line, extra_photos: [...line.extra_photos, ...added] } : line,
                            ),
                          }));
                        setUploading(null);
                      }
                    }}
                  />
                ) : null}
                {!item.receipt_path && (
                  <div className="space-y-2">
                    <Label htmlFor={`receipt-note-${item.id}`}>
                      Why is there no receipt? (optional)
                    </Label>
                    <Input
                      id={`receipt-note-${item.id}`}
                      maxLength={300}
                      value={item.no_receipt_reason}
                      onChange={(event) =>
                        updateLine(index, {
                          no_receipt_reason: event.target.value,
                        })
                      }
                    />
                  </div>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={form.items.length >= 20}
              onClick={() =>
                setForm({
                  ...form,
                  items: [
                    ...form.items,
                    {
                      id: crypto.randomUUID(),
                      particulars: "",
                      amount: "",
                      receipt_path: "",
                      extra_photos: [],
                      no_receipt_reason: "",
                      sheet_details: { plate: "" },
                    },
                  ],
                })
              }
            >
              <Plus />
              Add particular
            </Button>
            {form.items.length === 0 ? (
              <div className="space-y-2">
                <Label htmlFor="unspent-reason">
                  Why was the budget not spent?
                </Label>
                <Textarea
                  id="unspent-reason"
                  maxLength={300}
                  value={form.unspent_reason}
                  onChange={(event) =>
                    setForm({ ...form, unspent_reason: event.target.value })
                  }
                />
              </div>
            ) : null}
          </fieldset>
          <div className="lg:sticky lg:z-20 space-y-4 rounded-xl border bg-card/95 p-4 backdrop-blur lg:bottom-4">
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                ["Amount received", received],
                ["Amount spent", spent / 100],
                [
                  difference >= 0 ? "Amount to return" : "Reimbursement due",
                  Math.abs(difference) / 100,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-semibold">
                    <MoneyText value={value} />
                  </dd>
                </div>
              ))}
            </dl>
            <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
              {auto === "saving"
                ? "Saving…"
                : auto === "saved"
                  ? `Saved automatically at ${autoAt}. You can leave and come back to it.`
                  : auto === "kept"
                    ? "Not saved to the server yet (a line is still incomplete). What you typed is kept on this device."
                    : "Your work is saved automatically as you type."}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="submit" variant="outline" disabled={disabled}>
                {pending ? "Saving…" : "Save draft"}
              </Button>
              <Button
                type="button"
                disabled={disabled}
                onClick={reviewSubmission}
              >
                Submit for review
              </Button>
            </div>
          </div>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title="Submit liquidation?"
            description="Confirm the amounts and any attached receipts before sending them to your custodian."
            confirmLabel="Submit for review"
            pending={pending}
            onConfirm={() => void save(true)}
          />
        </form>
      </CardContent>
    </Card>
  );
}
