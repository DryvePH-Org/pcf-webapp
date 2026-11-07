"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { createBudgetRequest } from "@/actions/budget-requests";
import { Callout } from "@/components/shared/callout";
import { OptionSelect } from "@/components/shared/option-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createBudgetRequestSchema } from "@/lib/validators/budget-request";

export type RequestFund = { id: string; name: string; custodian_names: string[] };

const PURPOSE_MAX = 300;

function Required() {
  return <span className="text-destructive" aria-hidden>*</span>;
}

export function RequestForm({ funds, name }: { funds: RequestFund[]; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundId, setFundId] = useState(funds.length === 1 ? funds[0].id : "");
  const [purpose, setPurpose] = useState("");
  const fund = funds.find(item => item.id === fundId);

  async function submit(data: FormData) {
    const parsed = createBudgetRequestSchema.safeParse(Object.fromEntries(data));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await createBudgetRequest(parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Budget request submitted");
      router.push(`/requests/${result.id}`);
      router.refresh();
    } catch {
      setError("Could not submit the request. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Callout tone="info" title="How this works">
        A custodian reviews your request first. If it is approved they prepare a voucher and hand over the cash. Afterwards you file a liquidation with your receipts. Submitting does not release any cash.
      </Callout>
      <Card>
        <CardContent>
          <form action={submit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="request-fund">Fund <Required /></Label>
              <OptionSelect
                id="request-fund"
                name="fund_id"
                required
                disabled={pending}
                value={fundId}
                onValueChange={setFundId}
                options={[{ value: "", label: "Choose a fund" }, ...funds.map(item => ({ value: item.id, label: item.name }))]}
              />
              <p className="min-h-5 text-sm text-muted-foreground">
                {fund ? <>Reviewed by <span className="font-medium text-foreground">{fund.custodian_names.join(", ") || "no active custodian yet"}</span>.</> : "Pick the fund the cash should come from."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="request-amount">Budget needed <Required /></Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-lg text-muted-foreground">₱</span>
                <Input
                  id="request-amount"
                  name="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  required
                  disabled={pending}
                  maxLength={13}
                  className="h-14 pl-9 text-xl font-semibold tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="request-purpose">What is the budget for? <Required /></Label>
              <Textarea
                id="request-purpose"
                name="purpose"
                maxLength={PURPOSE_MAX}
                required
                rows={4}
                disabled={pending}
                value={purpose}
                onChange={event => setPurpose(event.target.value)}
                placeholder="Example: taxi and meals for the client visit in Makati on Nov 12"
              />
              <p className="text-right text-xs text-muted-foreground tabular-nums">{purpose.length}/{PURPOSE_MAX}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="request-name">Your name <Required /></Label>
              <Input id="request-name" name="requester_name" defaultValue={name} maxLength={100} required disabled={pending} />
            </div>

            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            <div className="flex justify-end border-t pt-4">
              <Button type="submit" size="lg" disabled={pending}>
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
