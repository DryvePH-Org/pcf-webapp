"use client";

import { useState } from "react";
import { usePending } from "@/lib/use-single-flight";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { createUser } from "@/actions/users";
import { PasswordInput } from "@/components/account/password-input";
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
import { ALL_ROLES, ROLE_LABELS } from "@/lib/permissions";
import { generatePassword } from "@/lib/password-generator";
import {
  createUserFormSchema,
  type CreateUserFormValues,
  type CreateUserValues,
} from "@/lib/validators/user";

const emptyValues: CreateUserFormValues = {
  full_name: "",
  email: "",
  password: "",
  confirm: "",
  role: "custodian",
};

const roleItems = ALL_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

export function UserFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (user: Omit<CreateUserValues, "password">) => void;
}) {
  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: emptyValues,
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const password = useWatch({ control: form.control, name: "password" });
  const confirm = useWatch({ control: form.control, name: "confirm" });
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting, isBusy] = usePending();

  async function onSubmit(formValues: CreateUserFormValues) {
    if (isBusy()) return;
    // the confirmation was only for checking; the server gets the password once
    const { confirm: _confirm, ...values } = formValues;
    void _confirm;
    setSubmitting(true);
    setServerError(null);
    let result;
    try {
      result = await createUser(values);
    } catch {
      setServerError("Could not create the account. Try again in a moment.");
      return;
    } finally {
      setSubmitting(false);
    }

    if (!result.ok) {
      setServerError(result.error);
      if (result.fieldErrors) {
        for (const [key, messages] of Object.entries(result.fieldErrors)) {
          form.setError(key as keyof CreateUserFormValues, {
            message: messages[0],
          });
        }
      }
      return;
    }

    onOpenChange(false);
    form.reset(emptyValues);
    setShowPasswords(false);
    onSaved({ full_name: values.full_name, email: values.email, role: values.role });
  }

  const errors = form.formState.errors;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New user"
      description="Create an account with their work email, password, and role."
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="user-name">Full name</Label>
          <Input
            id="user-name"
 maxLength={100}
            autoComplete="off"
            {...form.register("full_name")}
            aria-invalid={Boolean(errors.full_name)}
          />
          {errors.full_name ? (
            <p className="text-xs text-destructive">{errors.full_name.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-email">Email</Label>
          <Input
            id="user-email"
 maxLength={254}
            type="email"
            autoComplete="off"
            {...form.register("email")}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email ? (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-password">Password</Label>
          <Controller
            control={form.control}
            name="password"
            render={({ field }) => (
              <PasswordInput
                id="user-password"
                value={field.value}
                onChange={field.onChange}
                autoComplete="new-password"
                invalid={Boolean(errors.password)}
                visible={showPasswords}
                onVisibleChange={setShowPasswords}
                disabled={submitting}
              />
            )}
          />
          {errors.password ? (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Use 8–128 characters. Share the password with the user privately.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-password-confirm">Confirm password</Label>
          <Controller
            control={form.control}
            name="confirm"
            render={({ field }) => (
              <PasswordInput
                id="user-password-confirm"
                value={field.value}
                onChange={field.onChange}
                autoComplete="new-password"
                invalid={Boolean(errors.confirm) || (confirm !== "" && confirm !== password)}
                visible={showPasswords}
                onVisibleChange={setShowPasswords}
                disabled={submitting}
              />
            )}
          />
          {errors.confirm ? (
            <p className="text-xs text-destructive">{errors.confirm.message}</p>
          ) : confirm !== "" && confirm !== password ? (
            <p className="text-xs text-destructive">The two passwords don&apos;t match yet.</p>
          ) : confirm !== "" ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="size-3" />
              The passwords match.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => {
                // a strong one in both boxes, shown so it can be read out or copied
                const made = generatePassword();
                form.setValue("password", made, { shouldValidate: true });
                form.setValue("confirm", made, { shouldValidate: true });
                setShowPasswords(true);
              }}
            >
              <Wand2 />
              Generate a strong one
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={submitting || !password}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(password);
                  toast.success("Password copied");
                } catch {
                  toast.error("Could not copy. Select the password and copy it instead.");
                }
              }}
            >
              <Copy />
              Copy
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Role</Label>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) =>
                  field.onChange(value ?? "custodian")
                }
                items={roleItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.role ? (
            <p className="text-xs text-destructive">{errors.role.message}</p>
          ) : null}
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
            {submitting ? "Creating..." : "Create user"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveDialog>
  );
}
