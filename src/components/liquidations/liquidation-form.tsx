"use client";

import { formatDate } from "@/lib/dates";
import { ReceiptAttachment } from "./receipt-attachment";
import { useState } from "react";
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
import { uploadLiquidationReceipt } from "@/lib/liquidation-receipts";
import { parseMoney } from "@/lib/money";
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
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
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
  async function save(submit: boolean) {
    const parsed = (
      submit ? submitLiquidationSchema : saveLiquidationSchema
    ).safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await saveLiquidation(parsed.data, submit);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        submit ? "Submitted to the custodian" : "Liquidation draft saved",
      );
      setConfirm(false);
      router.refresh();
    } catch {
      setError("Could not save the liquidation. Try again.");
    } finally {
      setPending(false);
    }
  }
  function reviewSubmission() {
    const parsed = submitLiquidationSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    setConfirm(true);
  }
  return (
    <Card className="overflow-visible print:hidden">
      <CardHeader>
        <CardTitle>Requester liquidation</CardTitle>
      </CardHeader>
      <CardContent>
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
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
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
                <Label htmlFor="liquidation-department">Department</Label>
                <Input
                  id="liquidation-department"
                  maxLength={100}
                  value={form.department}
                  required
                  onChange={(event) =>
                    setForm({ ...form, department: event.target.value })
                  }
                />
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
                    <Label htmlFor={`amount-${item.id}`}>Amount (₱)</Label>
                    <Input
                      id={`amount-${item.id}`}
                      inputMode="decimal"
                      maxLength={13}
                      className="text-right tabular-nums"
                      value={item.amount}
                      onChange={(event) =>
                        updateLine(index, { amount: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`plate-${item.id}`}>
                      Plate number (optional)
                    </Label>
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
                  onRemove={() => updateLine(index, { receipt_path: "" })}
                  onChoose={async (file) => {
                    setUploading(item.id);
                    setError("");
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
                    } catch (problem) {
                      setError(
                        problem instanceof Error
                          ? problem.message
                          : "Upload failed.",
                      );
                    } finally {
                      setUploading(null);
                    }
                  }}
                />
                {!item.receipt_path && (
                  <div className="space-y-2">
                    <Label htmlFor={`receipt-note-${item.id}`}>
                      Missing receipt note (optional)
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
