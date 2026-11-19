"use client";

import { useState } from "react";
import { usePending } from "@/lib/use-single-flight";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { saveFund } from "@/actions/funds";
import type { CustodianOption, FundRow } from "@/components/admin/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPHP, parseMoney } from "@/lib/money";
import {
  fundFormSchema,
  type FundFormValues,
} from "@/lib/validators/fund";

const emptyValues: FundFormValues = {
  name: "",
  amount: "",
  per_txn_limit: "",
  approval_threshold: "3000.00",
  low_balance_pct: 25,
  custodian_ids: [],
  sheet_ledger: true,
  expense_tags: "",
};

export function FundFormDialog({
  open,
  onOpenChange,
  fund,
  custodians,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fund: FundRow | null;
  custodians: CustodianOption[];
  onSaved: () => void;
}) {
  const form = useForm<FundFormValues>({
    resolver: zodResolver(fundFormSchema),
    defaultValues: fund
      ? {
          name: fund.name,
          amount: fund.amount,
          per_txn_limit: fund.per_txn_limit,
          approval_threshold: fund.approval_threshold,
          low_balance_pct: fund.low_balance_pct,
          custodian_ids: fund.custodian_ids,
          sheet_ledger: fund.sheet_ledger,
          expense_tags: fund.expense_tags.join("\n"),
        }
      : emptyValues,
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting, isBusy] = usePending();
  const [pendingValues, setPendingValues] = useState<FundFormValues | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function persist(values: FundFormValues, confirmed: boolean) {
    if (isBusy()) return;
    setSubmitting(true);
    setServerError(null);
    const result = await saveFund({
      ...values,
      id: fund?.id,
      confirmAmountChange: confirmed,
    });
    setSubmitting(false);

    if (!result.ok) {
      setServerError(result.error);
      if (result.fieldErrors) {
        for (const [key, messages] of Object.entries(result.fieldErrors)) {
          form.setError(key as keyof FundFormValues, {
            message: messages[0],
          });
        }
      }
      return;
    }

    onOpenChange(false);
    onSaved();
  }

  function onSubmit(values: FundFormValues) {
    const amountChanged =
      fund !== null && parseMoney(values.amount) !== parseMoney(fund.amount);
    if (amountChanged) {
      setPendingValues(values);
      setConfirmOpen(true);
      return;
    }
    void persist(values, false);
  }

  const errors = form.formState.errors;
  const keepsSheet = useWatch({ control: form.control, name: "sheet_ledger" });

  return (
    <>
      <ResponsiveDialog
        open={open && !confirmOpen}
        onOpenChange={onOpenChange}
        title={fund ? "Edit fund" : "New fund"}
        description={
          fund
            ? "Update the fund settings. Changing the amount recalculates expected cash."
            : "Create a petty cash fund and assign its custodian."
        }
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fund-name">Fund name</Label>
            <Input
              id="fund-name"
 maxLength={80}
              {...form.register("name")}
              placeholder="Main Petty Cash"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fund-amount">Fund amount</Label>
              <Input
                id="fund-amount"
 maxLength={13}
                inputMode="decimal"
                placeholder="10000.00"
                {...form.register("amount")}
                aria-invalid={Boolean(errors.amount)}
              />
              {errors.amount ? (
                <p className="text-xs text-destructive">
                  {errors.amount.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fund-limit">Per-transaction limit</Label>
              <Input
                id="fund-limit"
 maxLength={13}
                inputMode="decimal"
                placeholder="1000.00"
                {...form.register("per_txn_limit")}
                aria-invalid={Boolean(errors.per_txn_limit)}
              />
              {errors.per_txn_limit ? (
                <p className="text-xs text-destructive">
                  {errors.per_txn_limit.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fund-approval">Approval needed from</Label>
              <Input
                id="fund-approval"
 maxLength={13}
                inputMode="decimal"
                placeholder="3000.00"
                {...form.register("approval_threshold")}
                aria-invalid={Boolean(errors.approval_threshold)}
              />
              {errors.approval_threshold ? (
                <p className="text-xs text-destructive">
                  {errors.approval_threshold.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Vouchers at or above this amount need an approver&apos;s OK
                  before cash is released. Smaller ones are released first and
                  reviewed after.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fund-low">Low-balance alert (%)</Label>
              <Input
                id="fund-low"
                type="number"
                min={1}
                max={100}
                inputMode="numeric"
                {...form.register("low_balance_pct", {
                  valueAsNumber: true,
                })}
                aria-invalid={Boolean(errors.low_balance_pct)}
              />
              {errors.low_balance_pct ? (
                <p className="text-xs text-destructive">
                  {errors.low_balance_pct.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Where the ledger is kept</Label>
              <Controller
                control={form.control}
                name="sheet_ledger"
                render={({ field }) => (
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={!field.value}
                      disabled={fund !== null}
                      onChange={(event) => field.onChange(!event.target.checked)}
                    />
                    <span>
                      Keep this fund&apos;s ledger in the database only
                      <span className="block text-xs text-muted-foreground">
                        {fund
                          ? "Fixed when a fund is created. A database-only fund is never written to a Google Sheet; its Excel file is made from the app."
                          : "No Google Sheet and no Grokbot for this fund. Every entry lives in the app, and the Excel file is made from it."}
                      </span>
                    </span>
                  </label>
                )}
              />
            </div>

            {!keepsSheet ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="fund-tags">Expense tags (one per line)</Label>
                <textarea
                  id="fund-tags"
                  rows={6}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  placeholder={"MEALS\nFUEL\nTRANSPORTATION"}
                  {...form.register("expense_tags")}
                />
                <p className="text-xs text-muted-foreground">
                  The custodian picks one of these for each expense when reviewing receipts.
                </p>
                {errors.expense_tags ? (
                  <p className="text-xs text-destructive">{errors.expense_tags.message}</p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2 sm:col-span-2">
              <Label>Custodians</Label>
              <Controller
                control={form.control}
                name="custodian_ids"
                render={({ field }) => (
                  <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                    {custodians.length === 0 ? (
                      <li className="px-1 text-sm text-muted-foreground">
                        No active custodians yet. Create one under Admin → Users.
                      </li>
                    ) : (
                      custodians.map((custodian) => (
                        <li key={custodian.id}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50">
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={field.value.includes(custodian.id)}
                              onChange={(event) =>
                                field.onChange(
                                  event.target.checked
                                    ? [...field.value, custodian.id]
                                    : field.value.filter((id) => id !== custodian.id),
                                )
                              }
                            />
                            {custodian.full_name}
                          </label>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Every ticked custodian can prepare and release their own vouchers for
                this fund, count its cash and request replenishments.
              </p>
              {errors.custodian_ids ? (
                <p className="text-xs text-destructive">
                  {errors.custodian_ids.message}
                </p>
              ) : null}
            </div>
          </div>

          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : fund ? "Save changes" : "Create fund"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveDialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          setConfirmOpen(next);
          if (!next) setPendingValues(null);
        }}
        title="Change the fund amount?"
        description={
          fund && pendingValues
            ? `Expected cash will be recalculated from ${formatPHP(fund.amount)} to ${formatPHP(pendingValues.amount)}. Voucher balances change with it.`
            : "Expected cash will be recalculated for this fund."
        }
        confirmLabel="Change amount"
        pending={submitting}
        onConfirm={() => {
          setConfirmOpen(false);
          if (pendingValues) void persist(pendingValues, true);
        }}
      />
    </>
  );
}
