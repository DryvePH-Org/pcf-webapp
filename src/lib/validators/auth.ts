import { z } from "zod";

import { emailField } from "@/lib/validators/text";

// Passwords are opaque: never trim, normalise, or apply text sanitisation.
export const newPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Use at most 128 characters.");

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password.").max(128),
});

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password.").max(128),
    next: newPasswordSchema,
    confirm: z.string().max(128),
  })
  .refine((value) => value.next === value.confirm, {
    path: ["confirm"],
    message: "The two new passwords don't match.",
  })
  .refine((value) => value.next !== value.current, {
    path: ["next"],
    message: "Choose a password different from your current one.",
  });

export const resetPasswordSchema = z.object({
  userId: z.uuid(),
  password: newPasswordSchema,
});

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
