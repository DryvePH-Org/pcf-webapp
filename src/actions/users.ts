"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, type ActionResult } from "@/lib/action-result";
import { getAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createUserSchema,
  setUserActiveSchema,
  updateUserRoleSchema,
  type CreateUserValues,
} from "@/lib/validators/user";

function validationError(error: z.ZodError): ActionResult {
  return actionError(
    "Check the highlighted fields.",
    z.flattenError(error).fieldErrors as Record<string, string[]>,
  );
}

export async function createUser(input: CreateUserValues): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return actionError("Only administrators can create users.");
  }

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { full_name, email, role } = parsed.data;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (error || !data.user) {
    const message = error?.message ?? "Could not create the account.";
    if (/already|registered|exists/i.test(message)) {
      return actionError("An account with this email already exists.");
    }
    return actionError(message);
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .insert({ id: data.user.id, full_name, role });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(data.user.id);
    return actionError(
      "Could not create the user profile. The account was rolled back.",
    );
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUserRole(input: {
  userId: string;
  role: CreateUserValues["role"];
}): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return actionError("Only administrators can change roles.");
  }
  if (input.userId === admin.id) {
    return actionError("You cannot change your own role.");
  }

  const parsed = updateUserRoleSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId)
    .select("id")
    .maybeSingle();

  if (error) return actionError(error.message);
  if (!data) return actionError("User not found.");

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(input: {
  userId: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return actionError("Only administrators can change user access.");
  }
  if (!input.isActive && input.userId === admin.id) {
    return actionError("You cannot deactivate your own account.");
  }

  const parsed = setUserActiveSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.userId)
    .select("id")
    .maybeSingle();

  if (error) return actionError(error.message);
  if (!data) return actionError("User not found.");

  revalidatePath("/admin/users");
  return { ok: true };
}
