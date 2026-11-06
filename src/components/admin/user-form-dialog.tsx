"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createUser } from "@/actions/users";
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
import {
  createUserSchema,
  type CreateUserValues,
} from "@/lib/validators/user";

const emptyValues: CreateUserValues = {
  full_name: "",
  email: "",
  password: "",
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
  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: emptyValues,
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(values: CreateUserValues) {
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
          form.setError(key as keyof CreateUserValues, {
            message: messages[0],
          });
        }
      }
      return;
    }

    onOpenChange(false);
    form.reset(emptyValues);
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
          <Input
            id="user-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            {...form.register("password")}
            aria-invalid={Boolean(errors.password)}
          />
          <p className="text-xs text-muted-foreground">Use 8–128 characters. Share the password with the user privately.</p>
          {errors.password ? (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          ) : null}
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
