"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createVoucher,
  updateVoucher,
  releaseVoucher,
  submitVoucher,
  suggestVoucherNumber,
} from "@/actions/vouchers";
import type { FundOption } from "@/components/vouchers/types";
import { OptionSelect } from "@/components/shared/option-select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  createVoucherSchema,
  MAX_VOUCHER_LINES,
  type CreateVoucherValues,
} from "@/lib/validators/voucher";
import { parseMoney } from "@/lib/money";
import { todayInAppTz } from "@/lib/dates";

type EditVoucher = {
  id: string;
  fund_id: string;
  voucher_date: string;
  payee: string;
  paper_pcv_number?: string | null;
  items: { particulars: string; amount: string; category_id?: string }[];
};
export function VoucherForm({
  funds,
  request,
  edit,
}: {
  funds: FundOption[];
  request?: {
    id: string;
    fund_id: string;
    name: string;
    purpose: string;
    amount: string;
  };
  edit?: EditVoucher;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState({ fund: "", value: "" });
  const [confirm, setConfirm] = useState(false);
  const form = useForm<CreateVoucherValues>({
    resolver: zodResolver(createVoucherSchema),
    defaultValues: {
      fund_id: edit?.fund_id ?? request?.fund_id ?? funds[0]?.id ?? "",
      budget_request_id: request?.id,
      voucher_date: edit?.voucher_date ?? todayInAppTz(),
      payee: edit?.payee ?? request?.name ?? "",
      number_mode: edit ? (edit.paper_pcv_number ? "manual" : "none") : "auto",
      number_value: edit?.paper_pcv_number ?? "",
      items: edit?.items ?? [
        { particulars: request?.purpose ?? "", amount: request?.amount ?? "" },
      ],
    },
  });
  const fields = useFieldArray({ control: form.control, name: "items" });
  const fundId = useWatch({ control: form.control, name: "fund_id" });
  const mode =
    useWatch({ control: form.control, name: "number_mode" }) ?? "auto";
  const items = useWatch({ control: form.control, name: "items" });
  const total = (items ?? []).reduce(
    (sum, item) => sum + (parseMoney(item.amount) ?? 0),
    0,
  );
  const selectedFund = funds.find((fund) => fund.id === fundId);
  const needsApproval =
    total >= (parseMoney(selectedFund?.approval_threshold ?? "") ?? Infinity);
  useEffect(() => {
    let active = true;
    if (fundId && mode === "auto")
      void suggestVoucherNumber(fundId)
        .then((result) => {
          if (active)
            setSuggestion({
              fund: fundId,
              value: result.ok ? result.number : result.error,
            });
        })
        .catch(() => {
          if (active)
            setSuggestion({
              fund: fundId,
              value: "Number will be assigned when saved.",
            });
        });
    return () => {
      active = false;
    };
  }, [fundId, mode]);

  async function save(advance: boolean) {
    setError("");
    const valid = await form.trigger();
    if (!valid) return;
    const values = form.getValues();
    if (advance && !confirm) {
      setConfirm(true);
      return;
    }
    setPending(true);
    try {
      if (edit) {
        const result = await updateVoucher({ ...values, voucher_id: edit.id });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Voucher updated");
        router.push(`/vouchers/${edit.id}`);
        router.refresh();
        return;
      }
      const created = await createVoucher(values);
      if (!created.ok) {
        setError(created.error);
        return;
      }
      if (advance) {
        const result = needsApproval
          ? await submitVoucher(created.id)
          : await releaseVoucher(created.id);
        if (!result.ok) toast.error(`Voucher saved as draft. ${result.error}`);
        else
          toast.success(
            needsApproval ? "Sent to approver" : "Cash release recorded",
          );
      } else toast.success("Voucher draft saved");
      router.push(`/vouchers/${created.id}`);
      router.refresh();
    } catch {
      setError("Could not save the voucher. Check its status before retrying.");
    } finally {
      setPending(false);
      setConfirm(false);
    }
  }
  const errors = form.formState.errors;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{edit ? "Edit voucher" : "Create cash voucher"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
          noValidate
        >
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <fieldset disabled={pending} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="voucher-number-mode">
                  Receipt / voucher number
                </Label>
                <OptionSelect
                  id="voucher-number-mode"
                  value={mode}
                  onValueChange={(value) =>
                    form.setValue(
                      "number_mode",
                      value as "auto" | "manual" | "none",
                    )
                  }
                  disabled={pending}
                  options={[
                    { value: "auto", label: "Automatic next number" },
                    { value: "manual", label: "Enter number manually" },
                    { value: "none", label: "No receipt / voucher number" },
                  ]}
                />
                {mode === "auto" ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Next suggested number{" "}
                    {suggestion.fund === fundId ? suggestion.value : "Loading…"}
                    . The final number is assigned when saved.
                  </p>
                ) : null}
              </div>
              {mode === "manual" ? (
                <div className="space-y-2">
                  <Label htmlFor="voucher-number">
                    Receipt / voucher number
                  </Label>
                  <Input
                    id="voucher-number"
                    maxLength={30}
                    {...form.register("number_value")}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="voucher-fund">Fund</Label>
                <OptionSelect
                  id="voucher-fund"
                  value={fundId}
                  disabled={pending || Boolean(request) || Boolean(edit)}
                  onValueChange={(value) => form.setValue("fund_id", value)}
                  options={funds.map((fund) => ({
                    value: fund.id,
                    label: fund.name,
                  }))}
                />
                {errors.fund_id ? (
                  <p className="text-xs text-destructive">
                    {errors.fund_id.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="voucher-date">Voucher date</Label>
                <Input
                  id="voucher-date"
                  type="date"
                  {...form.register("voucher_date")}
                  aria-invalid={Boolean(errors.voucher_date)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="voucher-payee">Payee</Label>
                <Input
                  id="voucher-payee"
                  maxLength={120}
                  readOnly={Boolean(request)}
                  {...form.register("payee")}
                  aria-invalid={Boolean(errors.payee)}
                />
                {errors.payee ? (
                  <p className="text-xs text-destructive">
                    {errors.payee.message}
                  </p>
                ) : null}
              </div>
            </div>
            {fields.fields.map((field, index) => (
              <div key={field.id} className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">Particular {index + 1}</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={fields.fields.length === 1}
                    onClick={() => fields.remove(index)}
                  >
                    <Trash2 />
                    Remove
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`voucher-particulars-${index}`}>
                    Particulars
                  </Label>
                  <Textarea
                    id={`voucher-particulars-${index}`}
                    maxLength={300}
                    {...form.register(`items.${index}.particulars`)}
                    aria-invalid={Boolean(errors.items?.[index]?.particulars)}
                  />
                  {errors.items?.[index]?.particulars ? (
                    <p className="text-xs text-destructive">
                      {errors.items[index]?.particulars?.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`voucher-amount-${index}`}>Amount (₱)</Label>
                  <Input
                    id={`voucher-amount-${index}`}
                    inputMode="decimal"
                    maxLength={13}
                    className="text-right tabular-nums"
                    {...form.register(`items.${index}.amount`)}
                    aria-invalid={Boolean(errors.items?.[index]?.amount)}
                  />
                  {errors.items?.[index]?.amount ? (
                    <p className="text-xs text-destructive">
                      {errors.items[index]?.amount?.message}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={fields.fields.length >= MAX_VOUCHER_LINES}
              onClick={() => fields.append({ particulars: "", amount: "" })}
            >
              <Plus />
              Add particular
            </Button>
          </fieldset>
          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 space-y-3 rounded-xl border bg-card/95 p-4 backdrop-blur lg:bottom-4">
            <div className="flex flex-wrap justify-between gap-2">
              <strong>
                Total <MoneyText value={total / 100} />
              </strong>
              <p className="text-sm text-muted-foreground">
                {needsApproval
                  ? "Approver approval required before release"
                  : "Custodian can release after confirmation"}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="submit" variant="outline" disabled={pending}>
                {pending ? "Saving…" : edit ? "Save changes" : "Save draft"}
              </Button>
              {!edit ? (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => void save(true)}
                >
                  {needsApproval
                    ? "Save and submit for approval"
                    : "Save and release cash"}
                </Button>
              ) : null}
            </div>
          </div>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={
              needsApproval
                ? "Submit voucher for approval?"
                : "Record cash released?"
            }
            description={
              needsApproval
                ? "The approver must approve this voucher before cash can be released."
                : "Confirm that this cash has been handed to the requester. This reduces the fund balance."
            }
            confirmLabel={
              needsApproval ? "Submit for approval" : "Confirm release"
            }
            pending={pending}
            onConfirm={() => void save(true)}
          />
        </form>
      </CardContent>
    </Card>
  );
}
