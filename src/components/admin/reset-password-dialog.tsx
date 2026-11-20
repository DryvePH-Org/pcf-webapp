"use client";

import { useState } from "react";
import { usePending } from "@/lib/use-single-flight";
import { Check, Copy, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { resetUserPassword } from "@/actions/users";
import { PasswordInput } from "@/components/account/password-input";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { generatePassword } from "@/lib/password-generator";

export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: { id: string; full_name: string; email: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving, isBusy] = usePending();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isBusy()) return;
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await resetUserPassword({ userId: user.id, password });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors?.password?.[0] ?? result.error);
      return;
    }
    toast.success(`New password set for ${user.full_name}. Share it with them privately.`);
    setPassword("");
    setConfirm("");
    setVisible(false);
    onOpenChange(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Password copied");
    } catch {
      toast.error("Could not copy. Select the password and copy it instead.");
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (!next) {
          setPassword("");
          setConfirm("");
          setVisible(false);
          setError(null);
        }
        onOpenChange(next);
      }}
      title={`Reset password for ${user.full_name}`}
      description={`Sets a new password for ${user.email}. Give it to them privately (in person or by phone, not in a group chat) and ask them to change it from their account menu.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reset-password">New password</Label>
          <PasswordInput id="reset-password" value={password} onChange={setPassword} autoComplete="new-password" invalid={Boolean(error)} disabled={saving} visible={visible} onVisibleChange={setVisible} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reset-password-confirm">Confirm new password</Label>
          <PasswordInput id="reset-password-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={confirm !== "" && confirm !== password} disabled={saving} visible={visible} onVisibleChange={setVisible} />
          {confirm !== "" && confirm !== password ? (
            <p className="text-xs text-destructive">The two passwords don&apos;t match yet.</p>
          ) : confirm !== "" ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="size-3" />
              The passwords match.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => { const made = generatePassword(); setPassword(made); setConfirm(made); setVisible(true); }}>
              <Wand2 />
              Generate a strong one
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={saving || !password} onClick={() => void copy()}>
              <Copy />
              Copy
            </Button>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || password.length < 8 || password !== confirm}>
            {saving ? "Saving..." : "Set new password"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveDialog>
  );
}
