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
  const { data, error } = await createAdminClient()
    .from("funds")
    .select("id, name")
    .eq("custodian_id", userId);
  if (error) throw error;
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

  // Remember who held what, so everyone affected can be told afterwards.
  const { data: funds, error: readError } = await createAdminClient()
    .from("funds")
    .select("id, name, custodian_id");
  if (readError) return actionError(readError.message);

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_custodian_funds", {
    p_user_id: userId,
    p_fund_ids: fundIds,
  });
  if (error) return actionError(safeDbMessage(error));

  const selected = new Set(fundIds);
  const added = funds.filter((fund) => selected.has(fund.id) && fund.custodian_id !== userId);
  const removed = funds.filter((fund) => !selected.has(fund.id) && fund.custodian_id === userId);

  const changes = new Map<string, { added: string[]; removed: string[] }>();
  const entry = (id: string) => {
    if (!changes.has(id)) changes.set(id, { added: [], removed: [] });
    return changes.get(id)!;
  };
  for (const fund of added) {
    entry(userId).added.push(fund.name);
    if (fund.custodian_id) entry(fund.custodian_id).removed.push(fund.name);
  }
  for (const fund of removed) entry(userId).removed.push(fund.name);

  for (const [recipientId, change] of changes) {
    queueNotification("fund.assignment_changed", () =>
      notifyFundAssignment({ userId: recipientId, ...change, actorId: admin.id }),
    );
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/funds");
  return { ok: true };
}
