import { ALL_ROLES } from "@/lib/permissions";
import { z } from "zod";

import { newPasswordSchema } from "@/lib/validators/auth";
import { emailField, personName } from "@/lib/validators/text";

export const roleSchema = z.enum(ALL_ROLES);

export const createUserSchema = z.object({
  full_name: personName(100),
  email: emailField,
  password: newPasswordSchema,
  role: roleSchema,
});

// The form asks for the password twice. Only the password goes to the server.
export const createUserFormSchema = createUserSchema
  .extend({ confirm: z.string().max(128) })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "The two passwords don't match.",
  });

export const updateUserRoleSchema = z.object({
  userId: z.string().uuid(),
  role: roleSchema,
});

export const setUserActiveSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

export type CreateUserValues = z.infer<typeof createUserSchema>;
export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;
