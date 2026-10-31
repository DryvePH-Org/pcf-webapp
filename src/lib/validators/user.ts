import { ALL_ROLES } from "@/lib/permissions";
import { z } from "zod";

const roleValues = ALL_ROLES as readonly [
  "admin",
  "custodian",
  "approver",
  "accounting",
];

export const roleSchema = z.enum(roleValues);

export const createUserSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(72, "Use at most 72 characters")
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/\d/, "Include at least one number"),
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
