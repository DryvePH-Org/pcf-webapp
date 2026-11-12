"use client";

import { useState } from "react";
import { Copy, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { resetUserPassword } from "@/actions/users";
import { PasswordInput } from "@/components/account/password-input";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// Readable characters only (no 0/O, 1/l/I), so the password can be read out or typed.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generatePassword() {
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]);
  return `${chars.slice(0, 7).join("")}-${chars.slice(7).join("")}`;
}

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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
          <PasswordInput id="reset-password" value={password} onChange={setPassword} autoComplete="new-password" invalid={Boolean(error)} disabled={saving} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setPassword(generatePassword())}>
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
          <Button type="submit" disabled={saving || password.length < 8}>
            {saving ? "Saving..." : "Set new password"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveDialog>
  );
}
