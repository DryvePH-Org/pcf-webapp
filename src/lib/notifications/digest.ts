import { formatPHP } from "@/lib/money";
import type { Role } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowDatabase } from "@/lib/workflow";

import { notify, recipientsByRole } from "./deliver";
import { decideReviewers } from "./routing";

export type DigestStats = {
  awaitingApproval: number;
  readyToRelease: number;
  pendingReviews: number;
  oldestReviewHours: number | null;
  flagged: number;
  drafts: number;
  submittedRequests: number;
  approvedRequests: number;
  lowFunds: { name: string; expectedCash: number }[];
};

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

function age(hours: number) {
  return hours >= 48 ? `${Math.floor(hours / 24)} days` : `${Math.max(1, Math.floor(hours))}h`;
}

type Item = { text: string; path: string };

// What each role needs to be reminded about today. An empty list means that
// role gets no email.
export function digestItemsFor(role: Role, stats: DigestStats): Item[] {
  const items: Item[] = [];

  const approval = () =>
    stats.awaitingApproval > 0 &&
    items.push({
      text: `${plural(stats.awaitingApproval, "voucher")} waiting for your approval before cash is released`,
      path: "/approvals",
    });
  const ready = () =>
    stats.readyToRelease > 0 &&
    items.push({
      text: `${plural(stats.readyToRelease, "approved voucher")} ready for you to release the cash`,
      path: "/vouchers",
    });
  const review = () =>
    stats.pendingReviews > 0 &&
    items.push({
      text: `${plural(stats.pendingReviews, "voucher")} waiting for review${
        stats.oldestReviewHours !== null ? ` (oldest ${age(stats.oldestReviewHours)})` : ""
      }`,
      path: "/approvals",
    });
  const flagged = () =>
    stats.flagged > 0 &&
    items.push({
      text: `${plural(stats.flagged, "flagged voucher")} still unresolved`,
      path: "/vouchers?status=rejected",
    });
  const drafts = () =>
    stats.drafts > 0 &&
    items.push({
      text: `${plural(stats.drafts, "draft voucher")} not yet released`,
      path: "/vouchers?status=draft",
    });
  const requests = () => {
    if (stats.submittedRequests > 0) {
      items.push({
        text: `${plural(stats.submittedRequests, "replenishment request")} waiting for accounting review`,
        path: "/replenishments",
      });
    }
    if (stats.approvedRequests > 0) {
      items.push({
        text: `${plural(stats.approvedRequests, "approved replenishment")} waiting to be closed`,
        path: "/replenishments",
      });
    }
  };
  const low = () => {
    for (const fund of stats.lowFunds) {
      items.push({
        text: `${fund.name} is low: ${formatPHP(fund.expectedCash)} on hand`,
        path: "/replenishments",
      });
    }
  };

  switch (role) {
    case "approver":
      approval();
      review();
      break;
    case "custodian":
      ready();
      flagged();
      drafts();
      low();
      break;
    case "accounting":
      requests();
      flagged();
      low();
      break;
    case "admin":
      approval();
      review();
      flagged();
      drafts();
      requests();
      low();
      break;
  }

  return items;
}

async function loadStats(): Promise<DigestStats> {
  const admin = createAdminClient();
  const vouchersWith = async (status: "submitted" | "released" | "rejected" | "draft") => {
    const { count } = await admin
      .from("vouchers")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    return count ?? 0;
  };
  const requestsWith = async (status: "submitted" | "approved") => {
    const { count } = await admin
      .from("replenishments")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    return count ?? 0;
  };

  const [
    awaitingApproval,
    readyToRelease,
    pendingReviews,
    flagged,
    drafts,
    submittedRequests,
    approvedRequests,
  ] = await Promise.all([
      vouchersWith("submitted"),
      admin
        .from("vouchers")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .is("released_at", null)
        .then(({ count }) => count ?? 0),
      vouchersWith("released"),
      vouchersWith("rejected"),
      vouchersWith("draft"),
      requestsWith("submitted"),
      requestsWith("approved"),
    ]);

  const { data: oldest } = await admin
    .from("vouchers")
    .select("released_at")
    .eq("status", "released")
    .order("released_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: low } = await admin
    .from("fund_balance_v")
    .select("name, expected_cash")
    .eq("is_low", true);

  return {
    awaitingApproval,
    readyToRelease,
    pendingReviews,
    oldestReviewHours: oldest?.released_at
      ? (Date.now() - new Date(oldest.released_at).getTime()) / 3_600_000
      : null,
    flagged,
    drafts,
    submittedRequests,
    approvedRequests,
    lowFunds: (low ?? []).map((fund) => ({
      name: fund.name ?? "Fund",
      expectedCash: fund.expected_cash ?? 0,
    })),
  };
}

const ROLES: Role[] = ["approver", "custodian", "accounting", "admin", "requester"];

type Personal = {
  fund: Map<string, { custodians: string[]; approvers: string[]; selfApproval: boolean }>;
  requests: { fund_id: string; requester_id: string }[];
  liquidations: { fund_id: string; owner_id: string; status: string }[];
  due: { owner_id: string; pcv_number: string; overdue: boolean; due_at: string }[];
};

async function loadPersonal(): Promise<Personal> {
  const admin = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  const [funds, custodians, approvers, requests, liquidations, due] = await Promise.all([
    admin.from("funds").select("id, custodian_self_approval"),
    admin.from("fund_custodians").select("fund_id, custodian_id"),
    admin.from("fund_approvers").select("fund_id, approver_id"),
    admin.from("budget_requests").select("fund_id, requester_id").eq("status", "submitted"),
    admin.from("liquidations").select("fund_id, owner_id, status").in("status", ["submitted", "flagged"]),
    admin.from("outstanding_liquidations_v").select("owner_id, pcv_number, overdue, due_at"),
  ]);
  const fund: Personal["fund"] = new Map();
  for (const row of funds.data ?? []) fund.set(row.id, { custodians: [], approvers: [], selfApproval: Boolean(row.custodian_self_approval) });
  for (const row of custodians.data ?? []) fund.get(row.fund_id)?.custodians.push(row.custodian_id);
  for (const row of approvers.data ?? []) fund.get(row.fund_id)?.approvers.push(row.approver_id);
  return {
    fund,
    requests: requests.data ?? [],
    liquidations: liquidations.data ?? [],
    due: (due.data ?? []).filter((row): row is Personal["due"][number] => Boolean(row.owner_id && row.pcv_number && row.due_at)),
  };
}

// What is waiting on this one person, using the same review rules as the app.
export function personalItems(userId: string, role: Role, data: Personal): Item[] {
  const items: Item[] = [];
  const mine = (fundId: string, ownerId: string) => {
    const info = data.fund.get(fundId);
    if (!info) return false;
    const reviewers = decideReviewers({ ownerId, custodianIds: info.custodians, approverIds: info.approvers, selfApproval: info.selfApproval });
    return reviewers.ids.includes(userId) || (reviewers.fallbackToAdmin && role === "admin");
  };
  const requests = data.requests.filter((row) => mine(row.fund_id, row.requester_id)).length;
  if (requests > 0) items.push({ text: `${plural(requests, "budget request")} waiting for your review`, path: "/requests?status=submitted" });
  const liquidations = data.liquidations.filter((row) => row.status === "submitted" && mine(row.fund_id, row.owner_id)).length;
  if (liquidations > 0) items.push({ text: `${plural(liquidations, "liquidation")} waiting for your review`, path: "/liquidations?status=submitted" });
  const flagged = data.liquidations.filter((row) => row.status === "flagged" && row.owner_id === userId).length;
  if (flagged > 0) items.push({ text: `${plural(flagged, "liquidation")} sent back for your corrections`, path: "/liquidations?status=flagged" });
  for (const row of data.due.filter((entry) => entry.owner_id === userId)) {
    items.push({
      text: row.overdue ? `Your liquidation for ${row.pcv_number} is overdue` : `Your liquidation for ${row.pcv_number} is due ${new Date(row.due_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
      path: "/requests",
    });
  }
  return items;
}

export async function sendDailyDigest() {
  const [stats, personal] = await Promise.all([loadStats(), loadPersonal()]);
  let recipients = 0;

  for (const role of ROLES) {
    const people = await recipientsByRole([role]);
    for (const person of people) {
      const items = [...(role === "requester" ? [] : digestItemsFor(role, stats)), ...(person.id ? personalItems(person.id, role, personal) : [])];
      if (items.length === 0) continue;
      recipients += 1;
      await notify({
        event: "digest.daily",
        recipients: [person],
        inApp: false,
        subject: `Daily summary: ${items.length === 1 ? items[0].text : `${items.length} things need attention`}`,
        content: () => ({
          tone: "action",
          heading: "What needs your attention today",
          paragraphs: items.map((item) => `• ${item.text}`),
          cta: { label: "Open the app", path: items[0].path },
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  return { recipients, stats };
}
