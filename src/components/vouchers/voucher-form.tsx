"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Plus, Save, Send, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  attachPaperVoucher,
  createVoucher,
  releaseVoucher,
  updateVoucher,
  setVoucherReceipt,
  submitVoucher,
} from "@/actions/vouchers";
import type { CategoryOption, FundOption } from "@/components/vouchers/types";
import {
  ReceiptUploader,
  type ReceiptMode,
} from "@/components/vouchers/receipt-uploader";
import { Callout } from "@/components/shared/callout";
import { MoneyText } from "@/components/shared/money-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { uploadReceipt } from "@/lib/receipts";
import { parseMoney } from "@/lib/money";
import { todayInAppTz } from "@/lib/dates";
import {
  createVoucherSchema,
  MAX_VOUCHER_LINES,
  type CreateVoucherValues,
} from "@/lib/validators/voucher";

function Required() {
  return <span className="text-destructive" aria-hidden>*</span>;
}

function SectionTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 border-t pt-5 first:border-t-0 first:pt-0">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{n}</span>
      <div>
        <h3 className="text-base leading-7 font-semibold">{title}</h3>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

const emptyLine = { particulars: "", amount: "", category_id: "" };

type Intent = "draft" | "release" | "submit";

export function VoucherForm({
  funds,
  categories,
  request,
  edit,
}: {
  funds: FundOption[];
  categories: CategoryOption[];
  request?: { id: string; fund_id: string; name: string; purpose: string; amount: string };
  // Set when correcting an existing draft; receipts and actions stay on the
  // voucher page.
  edit?: {
    id: string;
    fund_id: string;
    voucher_date: string;
    payee: string;
    items: { particulars: string; amount: string; category_id: string }[];
  };
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ReceiptMode>("receipt");
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Intent | null>(null);
  const [paperPhoto, setPaperPhoto] = useState<File | null>(null);

  const form = useForm<CreateVoucherValues>({
    resolver: zodResolver(createVoucherSchema),
    defaultValues: {
      fund_id: edit?.fund_id ?? request?.fund_id ?? funds[0]?.id ?? "",
      budget_request_id: request?.id,
      voucher_date: edit?.voucher_date ?? todayInAppTz(),
      payee: edit?.payee ?? request?.name ?? "",
      items: edit?.items ?? (request ? [{ particulars: request.purpose, amount: request.amount, category_id: "" }] : [emptyLine]),
      no_receipt_reason: "",
    },
  });
  const lines = useFieldArray({ control: form.control, name: "items" });

  const errors = form.formState.errors;
  const fundId = useWatch({ control: form.control, name: "fund_id" });
  const selectedFund = funds.find((fund) => fund.id === fundId);
  const watchedItems = useWatch({ control: form.control, name: "items" });
  // Sum in centavos; an unparsable line counts as zero until it is fixed.
  const amountCentavos = (watchedItems ?? []).reduce(
    (sum, item) => sum + (parseMoney(item?.amount ?? "") ?? 0),
    0,
  );
  const thresholdCentavos = selectedFund
    ? parseMoney(selectedFund.approval_threshold)
    : null;
  // At or above the fund's threshold an approver must approve before any cash
  // is released.
  const needsApproval =
    amountCentavos > 0 &&
    thresholdCentavos !== null &&
    amountCentavos >= thresholdCentavos;
  const fundItems = funds.map((fund) => ({ value: fund.id, label: fund.name }));
  const categoryItems = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  async function saveEdit(values: CreateVoucherValues) {
    if (!edit) return;
    setServerError(null);
    setSubmitting("draft");
    try {
      const result = await updateVoucher({
        voucher_id: edit.id,
        voucher_date: values.voucher_date,
        payee: values.payee,
        items: values.items,
      });
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      toast.success("Changes saved");
      router.push(`/vouchers/${edit.id}`);
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  async function submit(values: CreateVoucherValues, nextIntent: Intent) {
    setServerError(null);
    setReceiptError(null);

    if (nextIntent !== "draft") {
      if (mode === "receipt" && !file) {
        setReceiptError(
          "Attach a receipt photo or switch to No receipt and give a reason.",
        );
        return;
      }
      if (
        mode === "none" &&
        !values.no_receipt_reason?.trim()
      ) {
        setReceiptError("Give a short reason for the missing receipt.");
        return;
      }
    }

    setSubmitting(nextIntent);
    try {
      const result = await createVoucher({
        ...values,
        no_receipt_reason:
          mode === "none" ? values.no_receipt_reason?.trim() || undefined : undefined,
      });

      if (!result.ok) {
        setServerError(result.error);
        if (result.fieldErrors) {
          for (const [key, messages] of Object.entries(result.fieldErrors)) {
            form.setError(key as keyof CreateVoucherValues, {
              message: messages[0],
            });
          }
        }
        return;
      }

      const voucherId = result.id;

      if (mode === "receipt" && file) {
        try {
          const path = await uploadReceipt(file, values.fund_id, voucherId);
          const attached = await setVoucherReceipt({
            voucher_id: voucherId,
            receipt_path: path,
          });
          if (!attached.ok) throw new Error(attached.error);
        } catch (error) {
          toast.error(
            `Draft saved, but the receipt upload failed: ${error instanceof Error ? error.message : "unknown error"}. Attach it from the voucher page.`,
          );
          router.push(`/vouchers/${voucherId}`);
          return;
        }
      }

      if (paperPhoto) {
        try {
          const path = await uploadReceipt(paperPhoto, values.fund_id, voucherId);
          const attached = await attachPaperVoucher({
            voucher_id: voucherId,
            receipt_path: path,
          });
          if (!attached.ok) throw new Error(attached.error);
        } catch (error) {
          toast.error(
            `Voucher saved, but the paper voucher photo was not: ${error instanceof Error ? error.message : "unknown error"}.`,
          );
        }
      }

      if (nextIntent === "submit") {
        const submitted = await submitVoucher(voucherId);
        if (!submitted.ok) {
          toast.error(submitted.error);
          router.push(`/vouchers/${voucherId}`);
          return;
        }
        toast.success("Submitted for approver review.");
      } else if (nextIntent === "release") {
        const released = await releaseVoucher(voucherId);
        if (!released.ok) {
          toast.error(released.error);
          router.push(`/vouchers/${voucherId}`);
          return;
        }
        toast.success("Cash released. The approver will review it later.");
      } else {
        toast.success("Draft saved");
      }

      router.push(`/vouchers/${voucherId}`);
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  const submitDraft = form.handleSubmit((values) =>
    edit ? saveEdit(values) : submit(values, "draft"),
  );
  const submitRelease = form.handleSubmit((values) =>
    submit(values, needsApproval ? "submit" : "release"),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voucher details</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submitDraft} noValidate>
          {request ? <Alert><AlertDescription>From an approved budget request. Total must not exceed <MoneyText value={request.amount} />. Choose the categories and check every line before saving. No cash moves until release.</AlertDescription></Alert> : null}
          <SectionTitle n={1} title="Who is being paid" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="voucher-date">Voucher date <Required /></Label>
              <Input
                id="voucher-date"
                type="date"
                {...form.register("voucher_date")}
                aria-invalid={Boolean(errors.voucher_date)}
              />
              {errors.voucher_date ? (
                <p className="text-xs text-destructive">
                  {errors.voucher_date.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="voucher-fund">Fund <Required /></Label>
              {funds.length <= 1 || request ? (
                <div
                  id="voucher-fund"
                  className="flex h-10 items-center rounded-lg border bg-muted/50 px-3 text-sm font-medium"
                >
                  {selectedFund?.name ?? "No fund"}
                </div>
              ) : (
                <Controller
                  control={form.control}
                  name="fund_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => field.onChange(value ?? "")}
                      items={fundItems}
                      disabled={Boolean(request) || funds.length <= 1}
                    >
                      <SelectTrigger id="voucher-fund" className="w-full">
                        <SelectValue placeholder="Select a fund" />
                      </SelectTrigger>
                      <SelectContent>
                        {fundItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
              {errors.fund_id ? (
                <p className="text-xs text-destructive">
                  {errors.fund_id.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="voucher-payee">Payee <Required /></Label>
            <Input
              id="voucher-payee"
                readOnly={Boolean(request)}
              maxLength={120}
              placeholder="Who received the cash?"
              autoComplete="off"
              {...form.register("payee")}
              aria-invalid={Boolean(errors.payee)}
            />
            {errors.payee ? (
              <p className="text-xs text-destructive">{errors.payee.message}</p>
            ) : null}
          </div>

          <SectionTitle n={2} title="What the cash is for" hint="Add one line per item. The total is the sum of the lines." />
          <div className="space-y-3">
            {lines.fields.map((field, index) => {
              const lineErrors = errors.items?.[index];
              return (
                <div
                  key={field.id}
                  className="space-y-3 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Line {index + 1}
                    </span>
                    {lines.fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => lines.remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`voucher-particulars-${index}`}>
                      Particulars <Required />
                    </Label>
                    <Textarea
                      id={`voucher-particulars-${index}`}
                      maxLength={300}
                      placeholder="What was the cash spent on?"
                      rows={2}
                      {...form.register(`items.${index}.particulars`)}
                      aria-invalid={Boolean(lineErrors?.particulars)}
                    />
                    {lineErrors?.particulars ? (
                      <p className="text-xs text-destructive">
                        {lineErrors.particulars.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`voucher-amount-${index}`}>Amount <Required /></Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                          ₱
                        </span>
                        <Input
                          id={`voucher-amount-${index}`}
                          maxLength={13}
                          inputMode="decimal"
                          placeholder="0.00"
                          className="pl-7 text-right tabular-nums"
                          {...form.register(`items.${index}.amount`)}
                          aria-invalid={Boolean(lineErrors?.amount)}
                        />
                      </div>
                      {lineErrors?.amount ? (
                        <p className="text-xs text-destructive">
                          {lineErrors.amount.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`voucher-category-${index}`}>
                        Category <Required />
                      </Label>
                      <Controller
                        control={form.control}
                        name={`items.${index}.category_id`}
                        render={({ field: categoryField }) => (
                          <Select
                            value={categoryField.value}
                            onValueChange={(value) =>
                              categoryField.onChange(value ?? "")
                            }
                            items={categoryItems}
                          >
                            <SelectTrigger
                              id={`voucher-category-${index}`}
                              className="w-full"
                            >
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            <SelectContent>
                              {categoryItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {lineErrors?.category_id ? (
                        <p className="text-xs text-destructive">
                          {lineErrors.category_id.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {errors.items?.root || typeof errors.items?.message === "string" ? (
              <p className="text-xs text-destructive">
                {errors.items?.root?.message ?? errors.items?.message}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={lines.fields.length >= MAX_VOUCHER_LINES}
                onClick={() => lines.append(emptyLine)}
              >
                <Plus />
                Add line
              </Button>
              <p className="text-sm" data-testid="line-total">
                Total{" "}
                <span className="font-semibold tabular-nums">
                  <MoneyText value={String(amountCentavos / 100)} />
                </span>
              </p>
            </div>
            {needsApproval ? (
              <Callout tone="warning" title="This one needs approver approval first">
                It is at or above this fund&apos;s approval amount, so the main button submits it for approval. No cash is released until an approver says yes.
              </Callout>
            ) : null}
            {selectedFund ? (
              <p className="text-sm text-muted-foreground">
                Largest single voucher: <MoneyText value={selectedFund.per_txn_limit} className="font-medium text-foreground" />
                {" · "}
                Approval needed from <MoneyText value={selectedFund.approval_threshold} className="font-medium text-foreground" />
              </p>
            ) : null}
          </div>

          {edit ? null : (
            <>
          <SectionTitle n={3} title="Proof" hint="Attach the receipt, or say why there is none." />
          <div className="space-y-2">
            <Label>Receipt <Required /></Label>
            <ReceiptUploader
              file={file}
              onFileChange={(next) => {
                setFile(next);
                setReceiptError(null);
              }}
              mode={mode}
              onModeChange={(next) => {
                setMode(next);
                setReceiptError(null);
              }}
              disabled={submitting !== null}
              error={receiptError ?? undefined}
            />
          </div>

          {mode === "none" ? (
            <div className="space-y-2">
              <Label htmlFor="voucher-no-receipt-reason">
                Reason there is no receipt
              </Label>
              <Textarea
                id="voucher-no-receipt-reason"
              maxLength={300}
                placeholder="Example: the supplier does not issue official receipts."
                rows={2}
                {...form.register("no_receipt_reason")}
                aria-invalid={Boolean(errors.no_receipt_reason)}
              />
              {errors.no_receipt_reason ? (
                <p className="text-xs text-destructive">
                  {errors.no_receipt_reason.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2 border-t pt-5">
            <Label>Signed paper voucher photo <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <p className="text-[13px] text-muted-foreground">Photograph the paper copy once it is signed. It is kept with this voucher.</p>
            <ReceiptUploader
              file={paperPhoto}
              onFileChange={setPaperPhoto}
              mode="receipt"
              onModeChange={() => {}}
              allowNoReceipt={false}
              disabled={submitting !== null}
              label="Paper voucher"
            />
          </div>
            </>
          )}

          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-1 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur sm:p-4 lg:bottom-4">
            {serverError ? (
              <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {serverError}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Voucher total</p>
                <p className="text-2xl font-semibold tabular-nums">
                  <MoneyText value={String(amountCentavos / 100)} />
                </p>
              </div>
              <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none [&>button:last-child]:flex-[2] sm:[&>button:last-child]:flex-none">
                {edit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    onClick={() => router.push(`/vouchers/${edit.id}`)}
                  >
                    Cancel
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={submitting !== null}
                  onClick={submitDraft}
                >
                  <Save />
                  {submitting === "draft"
                    ? "Saving..."
                    : edit
                      ? "Save changes"
                      : "Save draft"}
                </Button>
                {edit ? null : (
                  <Button
                    type="button"
                    size="lg"
                    disabled={submitting !== null}
                    onClick={submitRelease}
                  >
                    {needsApproval ? <Send /> : <Wallet />}
                    {needsApproval
                      ? submitting === "submit"
                        ? "Submitting..."
                        : "Submit for approval"
                      : submitting === "release"
                        ? "Releasing..."
                        : "Save and release cash"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
