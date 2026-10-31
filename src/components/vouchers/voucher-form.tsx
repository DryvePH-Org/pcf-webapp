"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Save, Wallet } from "lucide-react";
import { toast } from "sonner";

import { createVoucher, releaseVoucher, setVoucherReceipt } from "@/actions/vouchers";
import type { CategoryOption, FundOption } from "@/components/vouchers/types";
import {
  ReceiptUploader,
  type ReceiptMode,
} from "@/components/vouchers/receipt-uploader";
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
import { todayInAppTz } from "@/lib/dates";
import {
  createVoucherSchema,
  type CreateVoucherValues,
} from "@/lib/validators/voucher";

type Intent = "draft" | "release";

export function VoucherForm({
  funds,
  categories,
}: {
  funds: FundOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ReceiptMode>("receipt");
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Intent | null>(null);

  const form = useForm<CreateVoucherValues>({
    resolver: zodResolver(createVoucherSchema),
    defaultValues: {
      fund_id: funds[0]?.id ?? "",
      voucher_date: todayInAppTz(),
      payee: "",
      particulars: "",
      amount: "",
      category_id: "",
      no_receipt_reason: "",
    },
  });

  const errors = form.formState.errors;
  const fundId = useWatch({ control: form.control, name: "fund_id" });
  const selectedFund = funds.find((fund) => fund.id === fundId);
  const fundItems = funds.map((fund) => ({ value: fund.id, label: fund.name }));
  const categoryItems = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  async function submit(values: CreateVoucherValues, nextIntent: Intent) {
    setServerError(null);
    setReceiptError(null);

    if (nextIntent === "release") {
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

      if (nextIntent === "release") {
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

  const submitDraft = form.handleSubmit((values) => submit(values, "draft"));
  const submitRelease = form.handleSubmit((values) =>
    submit(values, "release"),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voucher details</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submitDraft} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="voucher-date">Voucher date</Label>
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
              <Label htmlFor="voucher-fund">Fund</Label>
              <Controller
                control={form.control}
                name="fund_id"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value ?? "")}
                    items={fundItems}
                    disabled={funds.length <= 1}
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
              {errors.fund_id ? (
                <p className="text-xs text-destructive">
                  {errors.fund_id.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="voucher-payee">Payee</Label>
            <Input
              id="voucher-payee"
              placeholder="Who received the cash?"
              autoComplete="off"
              {...form.register("payee")}
              aria-invalid={Boolean(errors.payee)}
            />
            {errors.payee ? (
              <p className="text-xs text-destructive">{errors.payee.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="voucher-particulars">Particulars</Label>
            <Textarea
              id="voucher-particulars"
              placeholder="What was the cash spent on?"
              rows={3}
              {...form.register("particulars")}
              aria-invalid={Boolean(errors.particulars)}
            />
            {errors.particulars ? (
              <p className="text-xs text-destructive">
                {errors.particulars.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="voucher-amount">Amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                  ₱
                </span>
                <Input
                  id="voucher-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="pl-7 text-right tabular-nums"
                  {...form.register("amount")}
                  aria-invalid={Boolean(errors.amount)}
                />
              </div>
              {errors.amount ? (
                <p className="text-xs text-destructive">
                  {errors.amount.message}
                </p>
              ) : selectedFund ? (
                <p className="text-xs text-muted-foreground">
                  Limit per transaction:{" "}
                  <MoneyText value={selectedFund.per_txn_limit} />
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="voucher-category">Category</Label>
              <Controller
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value ?? "")}
                    items={categoryItems}
                  >
                    <SelectTrigger id="voucher-category" className="w-full">
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
              {errors.category_id ? (
                <p className="text-xs text-destructive">
                  {errors.category_id.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Proof of spending</Label>
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

          {serverError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={submitting !== null}
              onClick={submitDraft}
            >
              <Save />
              {submitting === "draft" ? "Saving..." : "Save draft"}
            </Button>
            <Button
              type="button"
              disabled={submitting !== null}
              onClick={submitRelease}
            >
              <Wallet />
              {submitting === "release"
                ? "Releasing..."
                : "Save and release cash"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
