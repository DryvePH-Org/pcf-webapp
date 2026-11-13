import type { SupabaseClient } from "@supabase/supabase-js";

import type { WorkflowDatabase } from "@/lib/workflow";

// May this person review a liquidation that belongs to `ownerId`? Anyone but the owner can
// (subject to fund access, checked separately). The owner can only when she is a custodian of
// the fund and the fund lets custodians approve their own; the database enforces the same rule.
export async function mayReviewOwner(
  db: SupabaseClient<WorkflowDatabase>,
  user: { id: string; role: string },
  fundId: string,
  ownerId: string,
) {
  if (ownerId !== user.id) return true;
  if (user.role !== "custodian") return false;
  const { data, error } = await db.rpc("self_approval_allowed", { p_fund: fundId, p_user: ownerId });
  return !error && data === true;
}
