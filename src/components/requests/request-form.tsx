"use client";

import { BudgetVoiceInput } from "./voice-input";
import { useState } from "react";
import { usePending } from "@/lib/use-single-flight";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { createBudgetRequest } from "@/actions/budget-requests";
import { FormModeBanner } from "@/components/shared/form-mode-banner";
import { Callout } from "@/components/shared/callout";
import { OptionSelect } from "@/components/shared/option-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createBudgetRequestSchema } from "@/lib/validators/budget-request";

export type RequestFund = {
  id: string;
  name: string;
  custodian_names: string[];
};

const PURPOSE_MAX = 300;

function Required() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  );
}

export function RequestForm({
  funds,
  name,
}: {
  funds: RequestFund[];
  name: string;
}) {
  const router = useRouter();
  const [pending, setPending, isBusy] = usePending();
  const [error, setError] = useState<string | null>(null);
  const [fundId, setFundId] = useState(funds.length === 1 ? funds[0].id : "");
  const [amount, setAmount] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [purpose, setPurpose] = useState("");
  const fund = funds.find((item) => item.id === fundId);

  async function submit(data: FormData) {
    const parsed = createBudgetRequestSchema.safeParse(
      Object.fromEntries(data),
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }
    if (isBusy()) return;
    setPending(true);
    setError(null);
    let leaving = false;
    try {
      const result = await createBudgetRequest(parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Budget request submitted");
      // The form stays disabled while the next page opens, so a late second
      // click cannot send the same request again.
      leaving = true;
      router.push(`/requests/${result.id}`);
      router.refresh();
    } catch {
      setError("Could not submit the request. Try again.");
    } finally {
      if (!leaving) setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <FormModeBanner
        title="Budget request form"
        hint="Fill in the fund, the amount and the purpose. Nothing is sent until you press Submit budget request."
      />
      <Callout tone="info" title="How this works">
        A custodian reviews your request first. If it is approved they prepare a
        voucher and hand over the cash. Afterwards you file a liquidation with
        your receipts. Submitting does not release any cash.
      </Callout>
      <Card>
        <CardContent>
          <form action={submit} className="space-y-6">
            <BudgetVoiceInput
              disabled={pending}
              onBusy={setVoiceBusy}
              onFill={(values) => {
                if (values.amount) setAmount(values.amount);
                if (values.purpose) setPurpose(values.purpose);
                if (values.fund_id) setFundId(values.fund_id);
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="request-fund">
                Fund <Required />
              </Label>
              <OptionSelect
                id="request-fund"
                name="fund_id"
                required
                disabled={pending || voiceBusy}
                value={fundId}
                onValueChange={setFundId}
                options={[
                  { value: "", label: "Choose a fund" },
                  ...funds.map((item) => ({
                    value: item.id,
                    label: item.custodian_names.length
                      ? `${item.name} · Custodian: ${item.custodian_names.join(", ")}`
                      : `${item.name} · no active custodian yet`,
                  })),
                ]}
              />
              <p className="min-h-5 text-sm text-muted-foreground">
                {fund ? (
                  <>
                    Reviewed by{" "}
                    <span className="font-medium text-foreground">
                      {fund.custodian_names.join(", ") ||
                        "no active custodian yet"}
                    </span>
                    .
                  </>
                ) : (
                  "Pick the fund the cash should come from."
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="request-amount">
                Budget needed <Required />
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-lg text-muted-foreground">
                  ₱
                </span>
                <Input
                  id="request-amount"
                  name="amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  required
                  disabled={pending || voiceBusy}
                  maxLength={13}
                  className="h-14 pl-9 text-xl font-semibold tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="request-purpose">
                What is the budget for? <Required />
              </Label>
              <Textarea
                id="request-purpose"
                name="purpose"
                maxLength={PURPOSE_MAX}
                required
                rows={4}
                disabled={pending || voiceBusy}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Example: taxi and meals for the client visit in Makati on Nov 12"
              />
              <p className="text-right text-xs text-muted-foreground tabular-nums">
                {purpose.length}/{PURPOSE_MAX}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="request-name">
                Your name <Required />
              </Label>
              <Input
                id="request-name"
                name="requester_name"
                value={name}
                readOnly
                maxLength={100}
                required
                disabled={pending || voiceBusy}
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end border-t pt-4">
              <Button type="submit" size="lg" disabled={pending || voiceBusy}>
                <Send />
                {pending ? "Submitting..." : "Submit budget request"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
