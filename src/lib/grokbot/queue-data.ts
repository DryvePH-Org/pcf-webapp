import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { positionsInLine, queueState, type QueueStateKey } from "./queue-view";

export type QueueRow = {
  id: string;
  kind: "liquidation_approved" | "replenishment_approved";
  title: string;
  who: string;
  amount: number;
  fund: string;
  workbook: string;
  state: QueueStateKey;
  label: string;
  detail: string;
  position: number | null;
  notBefore: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  canRetry: boolean;
};

export type QueueHealth = { workbook: string; waiting: number; sending: number; attention: number; lastWritten: string | null };

const FINANCIAL = ["liquidation_approved", "replenishment_approved"];

// Every job that moves money to a sheet, for the funds this person may see (an administrator sees them all).
export async function loadSheetQueue(user: { id: string; role: string }): Promise<{ rows: QueueRow[]; health: QueueHealth[] }> {
  const db = createAdminClient();
  const columns = "id, kind, status, runner_id, not_before, error, attempts, created_at, updated_at, spreadsheet_id, liquidation_id, replenishment_id";
  const [recent, open] = await Promise.all([
    db.from("grokbot_operations").select(columns).in("kind", FINANCIAL).order("created_at", { ascending: false }).limit(60),
    db.from("grokbot_operations").select(columns).in("kind", FINANCIAL).in("status", ["queued", "running", "blocked", "failed"]).limit(100),
  ]);
  if (recent.error || open.error) throw new Error("Could not read the sheet queue.");
  const byId = new Map([...(recent.data ?? []), ...(open.data ?? [])].map((op) => [op.id, op]));
  const ops = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const liquidationIds = ops.map((op) => op.liquidation_id).filter((id): id is string => Boolean(id));
  const replenishmentIds = ops.map((op) => op.replenishment_id).filter((id): id is string => Boolean(id));
  const [liquidations, replenishments, workbooks, myFunds] = await Promise.all([
    liquidationIds.length ? db.from("liquidations").select("id, pcv_number, total_spent, fund_id, employee_name").in("id", liquidationIds) : Promise.resolve({ data: [], error: null }),
    replenishmentIds.length ? db.from("replenishments").select("id, request_no, total, fund_id").in("id", replenishmentIds) : Promise.resolve({ data: [], error: null }),
    db.from("sheet_workbooks").select("id, name, spreadsheet_id"),
    user.role === "admin" ? Promise.resolve({ data: null, error: null }) : db.from("fund_custodians").select("fund_id").eq("custodian_id", user.id),
  ]);
  if (liquidations.error || replenishments.error || workbooks.error || myFunds.error) throw new Error("Could not read the sheet queue.");
  const fundIds = [...new Set([...(liquidations.data ?? []).map((l) => l.fund_id), ...(replenishments.data ?? []).map((r) => r.fund_id)])];
  const funds = fundIds.length ? await db.from("funds").select("id, name").in("id", fundIds) : { data: [], error: null };
  if (funds.error) throw new Error("Could not read the sheet queue.");

  const allowed = myFunds.data ? new Set(myFunds.data.map((row) => row.fund_id)) : null;
  const fundName = new Map((funds.data ?? []).map((f) => [f.id, f.name]));
  const bookOf = new Map((workbooks.data ?? []).map((w) => [w.spreadsheet_id, w.name]));
  const liq = new Map((liquidations.data ?? []).map((l) => [l.id, l]));
  const rep = new Map((replenishments.data ?? []).map((r) => [r.id, r]));
  // place in line counts the whole queue, so everyone sees the same number
  const positions = positionsInLine(ops);

  const rows: QueueRow[] = [];
  for (const op of ops) {
    const l = op.liquidation_id ? liq.get(op.liquidation_id) : undefined;
    const r = op.replenishment_id ? rep.get(op.replenishment_id) : undefined;
    const fundId = l?.fund_id ?? r?.fund_id;
    if (!fundId || (allowed && !allowed.has(fundId))) continue;
    const state = queueState(op);
    rows.push({
      id: op.id,
      kind: op.kind as QueueRow["kind"],
      title: l ? l.pcv_number : r ? `Replenishment ${r.request_no}` : "Unknown",
      who: l?.employee_name ?? "",
      amount: Number(l?.total_spent ?? r?.total ?? 0),
      fund: fundName.get(fundId) ?? "",
      workbook: bookOf.get(op.spreadsheet_id) ?? "",
      state: state.key,
      label: state.label,
      detail: state.detail,
      position: positions.get(op.id) ?? null,
      notBefore: op.not_before,
      attempts: op.attempts,
      createdAt: op.created_at,
      updatedAt: op.updated_at,
      canRetry: state.key === "attention",
    });
  }

  const health = new Map<string, QueueHealth>();
  for (const row of rows) {
    const h = health.get(row.workbook) ?? { workbook: row.workbook, waiting: 0, sending: 0, attention: 0, lastWritten: null };
    if (row.state === "waiting" || row.state === "retry_wait") h.waiting++;
    if (row.state === "sending") h.sending++;
    if (row.state === "attention") h.attention++;
    if (row.state === "written" && (!h.lastWritten || row.updatedAt > h.lastWritten)) h.lastWritten = row.updatedAt;
    health.set(row.workbook, h);
  }
  return { rows, health: [...health.values()].sort((a, b) => a.workbook.localeCompare(b.workbook)) };
}
