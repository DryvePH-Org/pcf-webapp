import type { SupabaseClient } from "@supabase/supabase-js";

import type { WorkflowDatabase } from "@/lib/workflow";

// May this person review a liquidation that belongs to `ownerId`? Three routes, and the
// database enforces the same rules:
//  - a custodian or administrator who is not the owner (subject to fund access, checked separately);
//  - the owner herself, only as a custodian of a fund that lets custodians approve their own;
//  - the fund's assigned approver, for a liquidation owned by one of that fund's custodians.
export async function mayReviewOwner(
  db: SupabaseClient<WorkflowDatabase>,
  user: { id: string; role: string },
  fundId: string,
  ownerId: string,
) {
  if (user.role === "approver") {
    if (ownerId === user.id) return false;
    const { data, error } = await db.rpc("approver_reviews_owner", { p_fund: fundId, p_owner: ownerId });
    return !error && data === true;
  }
  if (ownerId !== user.id) return true;
  if (user.role !== "custodian") return false;
  const { data, error } = await db.rpc("self_approval_allowed", { p_fund: fundId, p_user: ownerId });
  return !error && data === true;
}
