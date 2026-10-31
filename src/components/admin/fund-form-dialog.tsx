"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPHP, parseMoney } from "@/lib/money";
import {
  fundFormSchema,
  type FundFormValues,
} from "@/lib/validators/fund";

const emptyValues: FundFormValues = {
  name: "",
  amount: "",
  per_txn_limit: "",
  low_balance_pct: 25,
  custodian_id: "none",
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
          low_balance_pct: fund.low_balance_pct,
          custodian_id: fund.custodian_id ?? "none",
        }
      : emptyValues,
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingValues, setPendingValues] = useState<FundFormValues | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const custodianItems = [
    { value: "none", label: "Unassigned" },
    ...custodians.map((custodian) => ({
      value: custodian.id,
      label: custodian.full_name,
    })),
  ];

  async function persist(values: FundFormValues, confirmed: boolean) {
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

            <div className="space-y-2">
              <Label>Custodian</Label>
              <Controller
                control={form.control}
                name="custodian_id"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value ?? "none")}
                    items={custodianItems}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      {custodianItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.custodian_id ? (
                <p className="text-xs text-destructive">
                  {errors.custodian_id.message}
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
