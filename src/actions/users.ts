"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeDbMessage } from "@/lib/db-error";
import { actionError, type ActionResult } from "@/lib/action-result";
import { getAdminUser } from "@/lib/auth";
import { queueNotification } from "@/lib/notifications/deliver";
import {
  notifyFundAssignment,
  notifyUserAccessChanged,
  notifyUserRoleChanged,
  notifyUserWelcome,
} from "@/lib/notifications/events";
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


async function heldFunds(userId: string) {
  const admin = createAdminClient();
  const { data: links, error } = await admin
    .from("fund_custodians")
    .select("fund_id")
    .eq("custodian_id", userId);
  if (error) throw error;
  if (links.length === 0) return [];
  const { data, error: fundsError } = await admin
    .from("funds")
    .select("id, name")
    .in("id", links.map((link) => link.fund_id));
  if (fundsError) throw fundsError;
  return data;
}

function heldFundsMessage(names: string[]) {
  return `This custodian still holds ${names.join(", ")}. Reassign ${names.length === 1 ? "that fund" : "those funds"} first.`;
}

export async function createUser(input: CreateUserValues): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return actionError("Only administrators can create users.");
  }

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { full_name, email, password, role } = parsed.data;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
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

  const newUserId = data.user.id;
  queueNotification("user.welcome", () => notifyUserWelcome(newUserId, role, admin.id));
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

  if (parsed.data.role !== "custodian") {
    const held = await heldFunds(parsed.data.userId);
    if (held.length > 0) {
      return actionError(heldFundsMessage(held.map((fund) => fund.name)));
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId)
    .select("id")
    .maybeSingle();

  if (error) return actionError(safeDbMessage(error));
  if (!data) return actionError("User not found.");

  const changedId = parsed.data.userId;
  const newRole = parsed.data.role;
  queueNotification("user.role_changed", () =>
    notifyUserRoleChanged(changedId, newRole, admin.id),
  );
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

  if (!parsed.data.isActive) {
    const held = await heldFunds(parsed.data.userId);
    if (held.length > 0) {
      return actionError(heldFundsMessage(held.map((fund) => fund.name)));
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.userId)
    .select("id")
    .maybeSingle();

  if (error) return actionError(safeDbMessage(error));
  if (!data) return actionError("User not found.");

  const changedId = parsed.data.userId;
  const active = parsed.data.isActive;
  queueNotification("user.access_changed", () =>
    notifyUserAccessChanged(changedId, active, admin.id),
  );
  revalidatePath("/admin/users");
  return { ok: true };
}

const setCustodianFundsSchema = z.object({
  userId: z.string().uuid(),
  fundIds: z.array(z.string().uuid()).max(200),
});

export async function setCustodianFunds(input: {
  userId: string;
  fundIds: string[];
}): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return actionError("Only administrators can assign funds.");

  const parsed = setCustodianFundsSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { userId } = parsed.data;
  const fundIds = [...new Set(parsed.data.fundIds)];

  // Remember what this custodian held, so the change can be reported.
  const { data: funds, error: readError } = await createAdminClient()
    .from("funds")
    .select("id, name");
  if (readError) return actionError(safeDbMessage(readError));
  const { data: held, error: heldError } = await createAdminClient()
    .from("fund_custodians")
    .select("fund_id")
    .eq("custodian_id", userId);
  if (heldError) return actionError(safeDbMessage(heldError));
  const heldBefore = new Set(held.map((row) => row.fund_id));

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_custodian_funds", {
    p_user_id: userId,
    p_fund_ids: fundIds,
  });
  if (error) return actionError(safeDbMessage(error));

  const selected = new Set(fundIds);
  const added = funds.filter((fund) => selected.has(fund.id) && !heldBefore.has(fund.id));
  const removed = funds.filter((fund) => !selected.has(fund.id) && heldBefore.has(fund.id));

  if (added.length > 0 || removed.length > 0) {
    queueNotification("fund.assignment_changed", () =>
      notifyFundAssignment({
        userId,
        added: added.map((fund) => fund.name),
        removed: removed.map((fund) => fund.name),
        actorId: admin.id,
      }),
    );
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/funds");
  return { ok: true };
}
