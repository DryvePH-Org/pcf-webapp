import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowDatabase } from "@/lib/workflow";

// Who reviews a request or liquidation whose owner is `ownerId` in `fundId`,
// following the same rules the database enforces:
//  - the fund lets custodians approve their own and the owner is a custodian: nobody else needs to
//  - the owner is a custodian and the fund has an assigned approver: the approver
//  - otherwise: the fund's other custodians
// `fallbackToAdmin` is true when nobody is left to review (so admins are told).
export type Reviewers = { ids: string[]; selfApproved: boolean; fallbackToAdmin: boolean };

export function decideReviewers(input: {
  ownerId: string;
  custodianIds: string[];
  approverIds: string[];
  selfApproval: boolean;
}): Reviewers {
  const ownerIsCustodian = input.custodianIds.includes(input.ownerId);
  if (ownerIsCustodian && input.selfApproval) return { ids: [], selfApproved: true, fallbackToAdmin: false };
  const ids =
    ownerIsCustodian && input.approverIds.length > 0
      ? input.approverIds
      : input.custodianIds.filter((id) => id !== input.ownerId);
  return { ids, selfApproved: false, fallbackToAdmin: ids.length === 0 };
}

export async function reviewersFor(fundId: string, ownerId: string): Promise<Reviewers> {
  const db = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  const [custodians, approvers, fund] = await Promise.all([
    db.from("fund_custodians").select("custodian_id").eq("fund_id", fundId),
    db.from("fund_approvers").select("approver_id").eq("fund_id", fundId),
    db.from("funds").select("custodian_self_approval").eq("id", fundId).maybeSingle(),
  ]);
  if (custodians.error) throw custodians.error;
  if (approvers.error) throw approvers.error;
  if (fund.error) throw fund.error;
  return decideReviewers({
    ownerId,
    custodianIds: (custodians.data ?? []).map((row) => row.custodian_id),
    approverIds: (approvers.data ?? []).map((row) => row.approver_id),
    selfApproval: Boolean(fund.data?.custodian_self_approval),
  });
}
