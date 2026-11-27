import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentUser } from "@/lib/auth";
import { loadSheetQueue } from "@/lib/grokbot/queue-data";
import { canAccessRoute, canPerform } from "@/lib/permissions";
import { settlementBadgeCount } from "@/lib/settlements-due";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowDatabase } from "@/lib/workflow";

// What the side menu shows beside a page. `action` is work this person still has to do: it stays until the work is
// done, whoever opens the page. `seen` is news to look at (a decision, a status change): it goes away once the person
// opens the page.
export type NavIndicator = { action: number; seen: number };
export type NavIndicators = Record<string, NavIndicator>;

// Notifications that only need to be seen. An "action" one is covered by the live counts below instead.
export const SEEN_TONES = ["info", "success", "alert"] as const;

// The menu page a notification link belongs to: "/requests/abc?x=1" is under "/requests".
export function navHrefFor(linkPath: string | null, hrefs: readonly string[]): string | null {
  if (!linkPath) return null;
  const path = linkPath.split("?")[0];
  let best: string | null = null;
  for (const href of hrefs) {
    if ((path === href || path.startsWith(`${href}/`)) && (!best || href.length > best.length)) best = href;
  }
  return best;
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>) {
  const result = await query;
  return result.error ? 0 : (result.count ?? 0);
}

export const loadNavIndicators = cache(async (): Promise<NavIndicators> => {
  const user = await getCurrentUser();
  if (!user) return {};
  const db = (await createClient()) as unknown as SupabaseClient<WorkflowDatabase>;
  const isAdmin = user.role === "admin";
  const seesCash = user.role === "custodian" || isAdmin;
  const reviewer = canPerform(user.role, "request.review");
  const canApprove = canPerform(user.role, "voucher.approve");
  const canAccounting = canPerform(user.role, "replenishment.review");
  const head = { count: "exact", head: true } as const;

  const actions: Record<string, Promise<number>> = {};
  const add = (href: string, work: Promise<number>) => {
    if (canAccessRoute(user.role, href)) actions[href] = work.catch(() => 0);
  };

  add("/settlements", settlementBadgeCount());

  // Vouchers to finish, release or fix (the same lists as the dashboard).
  if (seesCash) {
    let drafts = db.from("vouchers").select("id", head).or("status.eq.draft,and(status.eq.approved,released_at.is.null)");
    if (!isAdmin) drafts = drafts.eq("prepared_by", user.id);
    add("/vouchers", Promise.all([count(drafts), count(db.from("vouchers").select("id", head).eq("status", "rejected"))]).then(([a, b]) => a + b));
  }

  if (canApprove) {
    add("/approvals", count(db.from("vouchers").select("id", head).in("status", ["submitted", "released"]).neq("prepared_by", user.id)));
  }

  if (canAccounting || canApprove) {
    add("/replenishments", count(db.from("replenishments").select("id", head).eq("status", "submitted")));
  }

  // Budget requests: the ones to review, the large ones to approve, and own requests nobody needs to wait on.
  add(
    "/requests",
    Promise.all([
      reviewer ? count(db.from("budget_requests").select("id", head).eq("status", "submitted").neq("requester_id", user.id)) : 0,
      user.role === "approver" || isAdmin
        ? count(db.from("budget_requests").select("id", head).eq("status", "awaiting_approver").neq("requester_id", user.id).neq("reviewed_by", user.id))
        : 0,
    ]).then(([a, b]) => a + b),
  );

  // Liquidations: own ones to finish or fix, and submitted ones to review.
  add(
    "/liquidations",
    (async () => {
      const own = await count(db.from("liquidations").select("id", head).eq("owner_id", user.id).in("status", ["flagged", "draft"]));
      if (!reviewer) return own;
      if (user.role !== "approver") {
        return own + (await count(db.from("liquidations").select("id", head).eq("status", "submitted").neq("owner_id", user.id)));
      }
      // an approver reviews the submitted ones in the funds they act in
      const waiting = await db.from("liquidations").select("fund_id").eq("status", "submitted").neq("owner_id", user.id).limit(500);
      const fundIds = [...new Set((waiting.data ?? []).map((row) => row.fund_id))];
      const acts = new Set<string>();
      await Promise.all(
        fundIds.map(async (fundId) => {
          if ((await db.rpc("approver_acts_in", { p_fund: fundId })).data === true) acts.add(fundId);
        }),
      );
      return own + (waiting.data ?? []).filter((row) => acts.has(row.fund_id)).length;
    })(),
  );

  // Jobs the bot could not finish, and numbers in the sheet that do not agree with the app.
  add(
    "/sheet-queue",
    loadSheetQueue(user).then((queue) => queue.rows.filter((row) => row.state === "attention").length + queue.checks.length),
  );
  if (isAdmin || user.role === "accounting") {
    add(
      "/accounting",
      count(
        (createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>)
          .from("sheet_edit_log")
          .select("id", head)
          .in("kind", ["number_unknown", "missing_in_sheet", "amount_differs"])
          .eq("applied", false)
          .is("resolved_at", null),
      ),
    );
  }

  // News: unread notifications that only need to be seen, by the menu page they point to.
  const news = db
    .from("notifications")
    .select("link_path")
    .is("read_at", null)
    .in("tone", [...SEEN_TONES])
    .not("link_path", "is", null)
    .limit(300);

  const [entries, unread] = await Promise.all([Promise.all(Object.entries(actions).map(async ([href, work]) => [href, await work] as const)), news]);
  const result: NavIndicators = {};
  for (const [href, action] of entries) if (action > 0) result[href] = { action, seen: 0 };
  const allHrefs = NAV_NEWS_PAGES.filter((href) => canAccessRoute(user.role, href));
  for (const row of unread.data ?? []) {
    const href = navHrefFor(row.link_path, allHrefs);
    if (!href) continue;
    (result[href] ??= { action: 0, seen: 0 }).seen++;
  }
  return result;
});

// Pages that can carry news even when they have no work counter of their own.
const NAV_NEWS_PAGES = ["/dashboard", "/requests", "/vouchers", "/liquidations", "/settlements", "/approvals", "/replenishments", "/sheet-queue", "/accounting", "/funds", "/audit"];
