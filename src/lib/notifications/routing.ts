import type { SupabaseClient } from "@supabase/supabase-js";

import type { Role } from "@/lib/permissions";
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

// ---------------------------------------------------------------------------------------------------------------
// Who is actually involved. A notification goes to the people of that fund and that record, never to a whole role
// across every fund. An administrator is told only when nobody else is left to act (and for the audit alerts that
// are for administrators by design).
export type FundPeople = { custodians: string[]; approvers: string[] };
export type Audience = { roles: Role[]; include: string[] };
export type AudienceKind =
  | "needs_approval" // a voucher or liquidation that an approver must clear
  | "voucher_released" // cash is out and waits for the approver's check
  | "stopped" // a voucher was flagged or voided
  | "replenishment_awaits_approver"
  | "replenishment_stopped" // a replenishment was rejected or closed
  | "low_balance";

const unique = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((id): id is string => Boolean(id)))];

export function audienceFor(kind: AudienceKind, people: FundPeople, involved: (string | null | undefined)[] = []): Audience {
  const adminIfNoApprover: Role[] = people.approvers.length ? [] : ["admin"];
  switch (kind) {
    case "needs_approval":
      return { roles: adminIfNoApprover, include: unique(people.approvers) };
    case "voucher_released":
      return { roles: [], include: unique(people.approvers) };
    case "stopped":
      return { roles: [], include: unique([...involved, ...people.custodians, ...people.approvers]) };
    case "replenishment_awaits_approver":
      return { roles: adminIfNoApprover, include: unique([...people.approvers, ...involved]) };
    case "replenishment_stopped":
      return { roles: [], include: unique([...involved, ...people.custodians]) };
    case "low_balance":
      // the custodians hold the cash; accounting does the replenishing
      return { roles: people.custodians.length ? ["accounting"] : ["accounting", "admin"], include: unique(people.custodians) };
  }
}

export async function fundPeople(fundId: string): Promise<FundPeople> {
  const db = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  const [custodians, approvers] = await Promise.all([
    db.from("fund_custodians").select("custodian_id").eq("fund_id", fundId),
    db.from("fund_approvers").select("approver_id").eq("fund_id", fundId),
  ]);
  if (custodians.error) throw custodians.error;
  if (approvers.error) throw approvers.error;
  return {
    custodians: (custodians.data ?? []).map((row) => row.custodian_id),
    approvers: (approvers.data ?? []).map((row) => row.approver_id),
  };
}
