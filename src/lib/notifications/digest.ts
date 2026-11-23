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

export const emptyStats = (): DigestStats => ({
  awaitingApproval: 0,
  readyToRelease: 0,
  pendingReviews: 0,
  oldestReviewHours: null,
  flagged: 0,
  drafts: 0,
  submittedRequests: 0,
  approvedRequests: 0,
  lowFunds: [],
});

// The counts of several funds added together (a person's own funds, or all of them).
export function mergeStats(list: DigestStats[]): DigestStats {
  const total = emptyStats();
  for (const stats of list) {
    total.awaitingApproval += stats.awaitingApproval;
    total.readyToRelease += stats.readyToRelease;
    total.pendingReviews += stats.pendingReviews;
    total.flagged += stats.flagged;
    total.drafts += stats.drafts;
    total.submittedRequests += stats.submittedRequests;
    total.approvedRequests += stats.approvedRequests;
    if (stats.oldestReviewHours !== null) total.oldestReviewHours = Math.max(total.oldestReviewHours ?? 0, stats.oldestReviewHours);
    total.lowFunds.push(...stats.lowFunds);
  }
  return total;
}

// Which funds a person's summary covers: a custodian's and an approver's own funds only; accounting and
// administrators oversee every fund.
export function fundsInScope(role: Role, userId: string, funds: Map<string, { custodians: string[]; approvers: string[] }>): string[] | "all" {
  if (role === "accounting" || role === "admin") return "all";
  const mine = [...funds.entries()]
    .filter(([, info]) => (role === "custodian" ? info.custodians : role === "approver" ? info.approvers : []).includes(userId))
    .map(([fundId]) => fundId);
  return mine;
}

async function loadStats(): Promise<Map<string, DigestStats>> {
  const admin = createAdminClient();
  const byFund = new Map<string, DigestStats>();
  const of = (fundId: string) => {
    let stats = byFund.get(fundId);
    if (!stats) byFund.set(fundId, (stats = emptyStats()));
    return stats;
  };
  const [vouchers, replenishments, low] = await Promise.all([
    admin.from("vouchers").select("fund_id, status, released_at").in("status", ["submitted", "approved", "released", "rejected", "draft"]),
    admin.from("replenishments").select("fund_id, status").in("status", ["submitted", "approved"]),
    admin.from("fund_balance_v").select("fund_id, name, expected_cash").eq("is_low", true),
  ]);
  const now = Date.now();
  for (const voucher of vouchers.data ?? []) {
    const stats = of(voucher.fund_id);
    if (voucher.status === "submitted") stats.awaitingApproval += 1;
    else if (voucher.status === "approved" && !voucher.released_at) stats.readyToRelease += 1;
    else if (voucher.status === "released") {
      stats.pendingReviews += 1;
      if (voucher.released_at) {
        const hours = (now - new Date(voucher.released_at).getTime()) / 3_600_000;
        stats.oldestReviewHours = Math.max(stats.oldestReviewHours ?? 0, hours);
      }
    } else if (voucher.status === "rejected") stats.flagged += 1;
    else if (voucher.status === "draft") stats.drafts += 1;
  }
  for (const request of replenishments.data ?? []) {
    const stats = of(request.fund_id);
    if (request.status === "submitted") stats.submittedRequests += 1;
    else stats.approvedRequests += 1;
  }
  for (const fund of low.data ?? []) {
    if (fund.fund_id) of(fund.fund_id).lowFunds.push({ name: fund.name ?? "Fund", expectedCash: fund.expected_cash ?? 0 });
  }
  return byFund;
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
  const [byFund, personal] = await Promise.all([loadStats(), loadPersonal()]);
  const stats = mergeStats([...byFund.values()]);
  let recipients = 0;

  for (const role of ROLES) {
    const people = await recipientsByRole([role]);
    for (const person of people) {
      // only the funds this person is involved in (accounting and administrators oversee all of them)
      const scope = person.id ? fundsInScope(role, person.id, personal.fund) : [];
      const own = scope === "all" ? stats : mergeStats(scope.map((fundId) => byFund.get(fundId)).filter((value): value is DigestStats => Boolean(value)));
      const items = [...(role === "requester" ? [] : digestItemsFor(role, own)), ...(person.id ? personalItems(person.id, role, personal) : [])];
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
