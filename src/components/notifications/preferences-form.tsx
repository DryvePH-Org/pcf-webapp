"use client";

import { useState } from "react";
import { toast } from "sonner";

import { saveNotificationPreferences } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { usePending } from "@/lib/use-single-flight";

export function NotificationPreferencesForm({
  initial,
  emailAvailable,
}: {
  initial: { emailActions: boolean; emailDigest: boolean };
  emailAvailable: boolean;
}) {
  const [emailActions, setEmailActions] = useState(initial.emailActions);
  const [emailDigest, setEmailDigest] = useState(initial.emailDigest);
  const [pending, setPending, isBusy] = usePending();
  const changed = emailActions !== initial.emailActions || emailDigest !== initial.emailDigest;

  async function save() {
    if (isBusy()) return;
    setPending(true);
    try {
      const result = await saveNotificationPreferences({ emailActions, emailDigest });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Email settings saved");
    } catch {
      toast.error("Could not save. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {!emailAvailable ? (
        <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
          Email is not switched on yet. Your choices are saved and apply once it is.
        </p>
      ) : null}
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={emailActions} onChange={(event) => setEmailActions(event.target.checked)} />
        <span>
          <span className="block text-sm font-medium">Email me when something needs me</span>
          <span className="block text-sm text-muted-foreground">A request or voucher to review, corrections to make, or your cash being ready. Account emails are always sent.</span>
        </span>
      </label>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={emailDigest} onChange={(event) => setEmailDigest(event.target.checked)} />
        <span>
          <span className="block text-sm font-medium">Morning summary</span>
          <span className="block text-sm text-muted-foreground">One short email at 8:00, only when something is waiting on you.</span>
        </span>
      </label>
      <p className="text-sm text-muted-foreground">The bell in the app always shows everything, whatever you choose here.</p>
      <Button onClick={() => void save()} disabled={pending || !changed}>
        {pending ? "Saving…" : "Save email settings"}
      </Button>
    </div>
  );
}
