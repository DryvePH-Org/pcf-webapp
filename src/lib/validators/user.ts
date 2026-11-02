import { ALL_ROLES } from "@/lib/permissions";
import { z } from "zod";

import { emailField, personName } from "@/lib/validators/text";

const roleValues = ALL_ROLES as readonly [
  "admin",
  "custodian",
  "approver",
  "accounting",
];

export const roleSchema = z.enum(roleValues);

export const createUserSchema = z.object({
  full_name: personName(100),
  email: emailField,
  role: roleSchema,
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
