import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { daysAgoIso } from "@/lib/dates";
import {
  AGE_BUCKETS,
  ageBucket,
  averageBetween,
  CHART_MONTHS,
  DAY_MS,
  fullMonth,
  HOUR_MS,
  lastMonths,
  monthKey,
  shortMonth,
  sumByMonth,
  topWithOther,
  type ChartSpec,
  type MyCharts,
} from "@/lib/my-charts";
import { createClient } from "@/lib/supabase/server";
import { VOUCHER_STATUS_LABELS, type VoucherStatus } from "@/lib/voucher-status";

type Db = Awaited<ReturnType<typeof createClient>>;

const LIMIT = 2000;

async function categoryNames(db: Db) {
  const { data } = await db.from("categories").select("id, name");
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

const columns = (title: string, description: string, unit: "money" | "count" | "hours", months: string[], values: number[]): ChartSpec => ({
  kind: "columns",
  title,
  description,
  unit,
  points: months.map((key, index) => ({ label: shortMonth(key), full: fullMonth(key), value: values[index] })),
});

// Spending by category from the lines of liquidations, which RLS has already limited to what this person may see.
type LiquidationWithLines = { liquidation_items: { amount: number; category_id: string }[] | null };
function categoryRows(liquidations: LiquidationWithLines[], names: Map<string, string>) {
  return topWithOther(
    liquidations.flatMap((liquidation) => (liquidation.liquidation_items ?? []).map((item) => ({ label: names.get(item.category_id) ?? "Other", value: Number(item.amount) }))),
  );
}

// The charts under the dashboard cards. Each person sees only their own activity (and, for a custodian, the funds
// they run); the database's row rules do the limiting, the filters below narrow it to the person.
export async function loadMyCharts(): Promise<MyCharts | null> {
  const user = await getCurrentUser();
  if (!user || !["custodian", "approver", "requester"].includes(user.role)) return null;
  const db = await createClient();
  const months = lastMonths(CHART_MONTHS);
  const since = daysAgoIso(CHART_MONTHS * 31 + 1);
  const names = await categoryNames(db);
  const period = `Last ${CHART_MONTHS} months`;

  if (user.role === "requester") {
    const [requests, liquidations] = await Promise.all([
      db.from("budget_requests").select("amount, status, created_at, reviewed_at").eq("requester_id", user.id).gte("created_at", since).limit(LIMIT),
      db
        .from("liquidations")
        .select("amount_received, total_spent, status, created_at, reviewed_at, liquidation_items(amount, category_id)")
        .eq("owner_id", user.id)
        .neq("status", "draft")
        .gte("created_at", since)
        .limit(LIMIT),
    ]);
    if (requests.error || liquidations.error) throw new Error("Could not load your charts.");
    const asked = requests.data ?? [];
    const filed = liquidations.data ?? [];
    const decided = asked.filter((row) => ["approved", "voucher_created", "rejected"].includes(row.status));
    const approved = decided.filter((row) => row.status !== "rejected");
    const outcome = (label: string, statuses: string[]) => ({ label, value: asked.filter((row) => statuses.includes(row.status)).length });
    return {
      heading: "Your activity",
      description: `${period}. Only you can see this.`,
      kpis: [
        { label: "Budget asked for", value: asked.reduce((sum, row) => sum + Number(row.amount), 0), unit: "money", hint: `${asked.length} request${asked.length === 1 ? "" : "s"}` },
        { label: "Approved", value: decided.length ? Math.round((approved.length / decided.length) * 100) : null, unit: "percent", hint: "of decided requests" },
        { label: "Time to an answer", value: averageBetween(decided.map((row) => ({ from: row.created_at, to: row.reviewed_at })), DAY_MS), unit: "days", hint: "on average" },
        { label: "Spent and filed", value: filed.reduce((sum, row) => sum + Number(row.total_spent), 0), unit: "money", hint: `${filed.length} liquidation${filed.length === 1 ? "" : "s"}` },
      ],
      charts: [
        columns("Budget you asked for", "Per month", "money", months, sumByMonth(asked, months, (row) => row.created_at, (row) => Number(row.amount))),
        {
          kind: "bars",
          title: "How your requests ended",
          description: "Number of requests",
          unit: "count",
          rows: [outcome("Approved", ["approved", "voucher_created"]), outcome("Waiting for a decision", ["submitted", "awaiting_approver"]), outcome("Rejected", ["rejected"]), outcome("Cancelled", ["cancelled"])],
          empty: "No requests yet.",
        },
        {
          kind: "paired",
          title: "Cash received and what you spent",
          description: "Per month, from your liquidations",
          unit: "money",
          a: "Cash received",
          b: "Spent",
          points: months.map((key, index) => ({
            label: shortMonth(key),
            full: fullMonth(key),
            a: sumByMonth(filed, months, (row) => row.created_at, (row) => Number(row.amount_received))[index],
            b: sumByMonth(filed, months, (row) => row.created_at, (row) => Number(row.total_spent))[index],
          })),
        },
        { kind: "bars", title: "Where your spending went", description: "By category, from your liquidations", unit: "money", rows: categoryRows(filed, names), empty: "No liquidations filed yet." },
      ],
    };
  }

  if (user.role === "custodian") {
    const [released, stages, reviewed, spending] = await Promise.all([
      db.from("vouchers").select("amount, released_at, prepared_by").not("released_at", "is", null).gte("released_at", since).limit(LIMIT),
      db.from("vouchers").select("status").gte("created_at", since).limit(LIMIT),
      db.from("liquidations").select("reviewed_at").eq("reviewed_by", user.id).gte("reviewed_at", since).limit(LIMIT),
      db.from("liquidations").select("status, liquidation_items(amount, category_id)").eq("status", "approved").gte("reviewed_at", since).limit(LIMIT),
    ]);
    if (released.error || stages.error || reviewed.error || spending.error) throw new Error("Could not load your charts.");
    const cash = released.data ?? [];
    const thisMonth = months[months.length - 1];
    const releasedPerMonth = sumByMonth(cash, months, (row) => row.released_at, (row) => Number(row.amount));
    const reviewedPerMonth = sumByMonth(reviewed.data ?? [], months, (row) => row.reviewed_at, () => 1);
    const stageCount = (status: VoucherStatus) => ({ label: VOUCHER_STATUS_LABELS[status], value: (stages.data ?? []).filter((row) => row.status === status).length });
    return {
      heading: "Your activity",
      description: `${period}, in the funds you run.`,
      kpis: [
        { label: "Cash released this month", value: releasedPerMonth[releasedPerMonth.length - 1], unit: "money", hint: fullMonth(thisMonth) },
        { label: "Vouchers you prepared", value: cash.filter((row) => row.prepared_by === user.id).length, unit: "count", hint: "released, in this period" },
        { label: "Liquidations you reviewed", value: reviewed.data?.length ?? 0, unit: "count", hint: "in this period" },
        { label: "Cash released", value: cash.reduce((sum, row) => sum + Number(row.amount), 0), unit: "money", hint: "in this period" },
      ],
      charts: [
        columns("Cash released", "Per month, all vouchers in your funds", "money", months, releasedPerMonth),
        columns("Liquidations you reviewed", "Per month", "count", months, reviewedPerMonth),
        { kind: "bars", title: "Where the money was spent", description: "Approved liquidations, by category", unit: "money", rows: categoryRows((spending.data ?? []) as LiquidationWithLines[], names), empty: "No approved liquidations yet." },
        {
          kind: "bars",
          title: "Vouchers by stage",
          description: "Created in this period",
          unit: "count",
          rows: (["draft", "submitted", "released", "approved", "closed", "rejected"] as VoucherStatus[]).map(stageCount),
          empty: "No vouchers yet.",
        },
      ],
    };
  }

  // approver
  const [approvedByMe, waiting, decidedRequests] = await Promise.all([
    db.from("vouchers").select("amount, category_id, submitted_at, approved_at").eq("approved_by", user.id).not("approved_at", "is", null).gte("approved_at", since).limit(LIMIT),
    db.from("vouchers").select("submitted_at, released_at, created_at").in("status", ["submitted", "released"]).neq("prepared_by", user.id).limit(LIMIT),
    db.from("budget_requests").select("status, reviewed_at").eq("reviewed_by", user.id).gte("reviewed_at", since).limit(LIMIT),
  ]);
  if (approvedByMe.error || waiting.error || decidedRequests.error) throw new Error("Could not load your charts.");
  const approvals = approvedByMe.data ?? [];
  const perMonthCount = sumByMonth(approvals, months, (row) => row.approved_at, () => 1);
  const queue = waiting.data ?? [];
  const age = new Map<string, number>(AGE_BUCKETS.map((label) => [label, 0]));
  for (const row of queue) {
    const waitingSince = row.submitted_at ?? row.released_at ?? row.created_at;
    const bucket = ageBucket(Math.floor((Date.now() - Date.parse(waitingSince)) / DAY_MS));
    age.set(bucket, (age.get(bucket) ?? 0) + 1);
  }
  const requestRows = decidedRequests.data ?? [];
  const hoursToApprove = months.map(
    (key) => averageBetween(approvals.filter((row) => row.approved_at && monthKey(row.approved_at) === key).map((row) => ({ from: row.submitted_at, to: row.approved_at })), HOUR_MS) ?? 0,
  );
  return {
    heading: "Your activity",
    description: `${period}. Only you can see this.`,
    kpis: [
      { label: "Vouchers you approved", value: approvals.length, unit: "count", hint: "in this period" },
      { label: "Amount approved", value: approvals.reduce((sum, row) => sum + Number(row.amount), 0), unit: "money", hint: "in this period" },
      { label: "Time to approve", value: averageBetween(approvals.map((row) => ({ from: row.submitted_at, to: row.approved_at })), HOUR_MS), unit: "hours", hint: "on average, large vouchers" },
      { label: "Waiting for you", value: queue.length, unit: "count", hint: "vouchers now" },
    ],
    charts: [
      columns("Vouchers you approved", "Per month", "count", months, perMonthCount),
      columns("Amount you approved", "Per month", "money", months, sumByMonth(approvals, months, (row) => row.approved_at, (row) => Number(row.amount))),
      columns("Time to approve", "Average hours from request to approval, per month", "hours", months, hoursToApprove),
      { kind: "bars", title: "Waiting for you, by age", description: "Vouchers still to approve or review", unit: "count", rows: AGE_BUCKETS.map((label) => ({ label, value: age.get(label) ?? 0 })), empty: "Nothing is waiting." },
      { kind: "bars", title: "Where the approved money went", description: "By category", unit: "money", rows: topWithOther(approvals.map((row) => ({ label: names.get(row.category_id) ?? "Other", value: Number(row.amount) }))), empty: "No approvals yet." },
      {
        kind: "bars",
        title: "Budget requests you decided",
        description: "Number of requests",
        unit: "count",
        rows: [
          { label: "Approved", value: requestRows.filter((row) => row.status !== "rejected").length },
          { label: "Rejected", value: requestRows.filter((row) => row.status === "rejected").length },
        ],
        empty: "No decisions yet.",
      },
    ],
  };
}
