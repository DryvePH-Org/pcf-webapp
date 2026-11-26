"use server";

import { createClient as createStandaloneClient, type SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { safeDbMessage } from "@/lib/db-error";
import { withinLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowDatabase } from "@/lib/workflow";

export type CorrectionPreview = { pcv: string; owner: string; status: string; spent: number; blockers: string[]; in_sheet: boolean };

export type CorrectionResult = { ok: true; pcv: string; inSheet: boolean; mode: "draft" | "delete" } | { ok: false; error: string };

const correctionSchema = z.object({
  id: z.uuid(),
  mode: z.enum(["draft", "delete"]),
  reason: z.string().trim().min(5, "Write the reason (at least 5 characters).").max(300, "Keep the reason under 300 characters."),
  password: z.string().min(1, "Type your password to confirm.").max(200),
});

// What sending a liquidation back would do, and what stops it. Administrators only.
function fail(error: string): CorrectionResult {
  return { ok: false, error };
}

export async function previewLiquidationCorrection(id: string): Promise<{ ok: true; preview: CorrectionPreview } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, error: "Only an administrator can do this." };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "That liquidation was not found." };
  const db = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  const { data, error } = await db.rpc("admin_preview_liquidation_reopen", { p_actor: user.id, p_id: id });
  if (error || !data) return { ok: false, error: error ? safeDbMessage(error) : "That liquidation was not found." };
  return { ok: true, preview: data };
}

// Send a liquidation back to its owner as a draft, or delete it, after the administrator types their own password again.
// The password is checked here on a throwaway client and never stored or logged; the database function can only be
// called from the server, so it cannot be reached without this check.
export async function correctLiquidation(input: unknown): Promise<CorrectionResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return fail("Only an administrator can do this.");
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  if (!(await withinLimit(`admin-correction:${user.id}`, 5, 600))) return fail("Too many attempts. Wait a few minutes, then try again.");

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser?.email) return fail("Sign in again, then retry.");
  const checker = createStandaloneClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: wrongPassword } = await checker.auth.signInWithPassword({ email: authUser.email, password: parsed.data.password });
  if (wrongPassword) return fail("Your password is not correct.");
  await checker.auth.signOut({ scope: "local" });

  const db = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  const { data, error } = await db.rpc("admin_reopen_liquidation", {
    p_actor: user.id,
    p_id: parsed.data.id,
    p_mode: parsed.data.mode,
    p_reason: parsed.data.reason,
  });
  if (error || !data) return fail(error ? safeDbMessage(error) : "Could not complete the correction.");

  for (const path of ["/liquidations", `/liquidations/${parsed.data.id}`, "/vouchers", "/dashboard", "/sheet-queue", "/accounting"]) revalidatePath(path);
  return { ok: true, pcv: data.pcv, inSheet: data.in_sheet, mode: parsed.data.mode };
}
