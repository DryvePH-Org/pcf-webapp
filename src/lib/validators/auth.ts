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
