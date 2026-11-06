"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createBudgetRequest } from "@/actions/budget-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createBudgetRequestSchema } from "@/lib/validators/budget-request";

export type RequestFund = { id: string; name: string; custodian_names: string[] };

export function RequestForm({ funds, name }: { funds: RequestFund[]; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(data: FormData) {
    const parsed = createBudgetRequestSchema.safeParse(Object.fromEntries(data));
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the form."); return; }
    setPending(true); setError(null);
    try {
      const result = await createBudgetRequest(parsed.data);
      if (!result.ok) { setError(result.error); return; }
      toast.success("Budget request submitted");
      router.push(`/requests/${result.id}`); router.refresh();
    } catch { setError("Could not submit the request. Try again."); }
    finally { setPending(false); }
  }
  return (
    <form action={submit} className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
      <div className="space-y-2">
        <Label htmlFor="request-name">Name</Label>
        <Input id="request-name" name="requester_name" defaultValue={name} maxLength={100} required className="h-11" disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="request-fund">Fund and custodians</Label>
        <select id="request-fund" name="fund_id" required disabled={pending} defaultValue="" className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="" disabled>Choose a fund</option>
          {funds.map(fund => <option key={fund.id} value={fund.id}>{fund.name} — {fund.custodian_names.join(", ")}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">Any assigned custodian can review your request. Requests do not reserve or release cash.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="request-amount">Budget (₱)</Label>
        <Input id="request-amount" name="amount" inputMode="decimal" placeholder="0.00" required className="h-11" disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="request-purpose">Purpose of the budget</Label>
        <Textarea id="request-purpose" name="purpose" maxLength={300} required rows={4} disabled={pending} />
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Button className="h-11" type="submit" disabled={pending}>{pending ? "Submitting..." : "Submit budget request"}</Button>
    </form>
  );
}
