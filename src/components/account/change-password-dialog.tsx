"use client";

import { useState } from "react";
import { usePending } from "@/lib/use-single-flight";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { changeMyPassword } from "@/actions/auth";
import { PasswordInput } from "@/components/account/password-input";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Field = "current" | "next" | "confirm";

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<Field, string>>({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<{ field?: Field; message: string } | null>(null);
  const [saving, setSaving, isBusy] = usePending();

  const set = (field: Field) => (value: string) => setValues((current) => ({ ...current, [field]: value }));

  function close(next: boolean) {
    if (saving) return;
    if (!next) {
      setValues({ current: "", next: "", confirm: "" });
      setError(null);
    }
    onOpenChange(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isBusy()) return;
    setSaving(true);
    setError(null);
    const result = await changeMyPassword(values);
    setSaving(false);
    if (!result.ok) {
      setError({ field: result.field, message: result.error });
      return;
    }
    setValues({ current: "", next: "", confirm: "" });
    onOpenChange(false);
    if (result.signedOut) {
      toast.success("Password changed. Sign in again with your new password.");
      router.push("/login");
      router.refresh();
      return;
    }
    toast.success("Password changed. Any other devices were signed out.");
  }

  const fieldError = (field: Field) =>
    error?.field === field ? <p className="text-sm font-medium text-destructive">{error.message}</p> : null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title="Change your password"
      description="Use at least 8 characters. A short sentence is easy to remember and hard to guess."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password-current">Current password</Label>
          <PasswordInput id="password-current" value={values.current} onChange={set("current")} autoComplete="current-password" invalid={error?.field === "current"} disabled={saving} />
          {fieldError("current")}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password-next">New password</Label>
          <PasswordInput id="password-next" value={values.next} onChange={set("next")} autoComplete="new-password" invalid={error?.field === "next"} disabled={saving} />
          {fieldError("next")}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password-confirm">New password again</Label>
          <PasswordInput id="password-confirm" value={values.confirm} onChange={set("confirm")} autoComplete="new-password" invalid={error?.field === "confirm"} disabled={saving} />
          {fieldError("confirm")}
        </div>
        {error && !error.field ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        <p className="text-sm text-muted-foreground">You stay signed in here. Other phones and computers using your account will be signed out.</p>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !values.current || !values.next || !values.confirm}>
            {saving ? "Changing..." : "Change password"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveDialog>
  );
}
