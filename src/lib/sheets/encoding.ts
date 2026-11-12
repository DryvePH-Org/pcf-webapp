import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeReport, type EncodingSummary } from "@/lib/grokbot/report-summary";

// What a person needs to know about a Grokbot write, in four plain states.
export type EncodingState = "waiting" | "encoding" | "encoded" | "attention";

export type EncodingInfo = {
  state: EncodingState;
  error: string | null;
  updatedAt: string | null;
  summary: EncodingSummary;
};

export function encodingState(operationStatus: string | null | undefined, jobStatus: string): EncodingState {
  if (jobStatus === "synced" || operationStatus === "completed") return "encoded";
  if (operationStatus === "blocked" || operationStatus === "failed") return "attention";
  if (operationStatus === "running") return "encoding";
  return "waiting";
}

function info(
  operation: { status: string; error: string | null; report: unknown; updated_at: string } | null,
  jobStatus: string,
  fallbackReport: unknown,
  fallbackError: string | null,
  fallbackUpdatedAt: string | null,
): EncodingInfo {
  const state = encodingState(operation?.status, jobStatus);
  return {
    state,
    error: state === "attention" || state === "waiting" ? (operation?.error ?? fallbackError) : null,
    updatedAt: operation?.updated_at ?? fallbackUpdatedAt,
    summary: summarizeReport(operation?.report ?? fallbackReport),
  };
}

export async function liquidationEncoding(liquidationId: string): Promise<EncodingInfo | null> {
  const db = createAdminClient();
  const { data: job } = await db
    .from("sheet_jobs")
    .select("status,error,report,updated_at,operation_id")
    .eq("liquidation_id", liquidationId)
    .maybeSingle();
  if (!job) return null;
  const { data: operation } = await db
    .from("grokbot_operations")
    .select("status,error,report,updated_at")
    .eq("id", job.operation_id)
    .maybeSingle();
  return info(operation, job.status, job.report, job.error, job.updated_at);
}

export async function replenishmentEncoding(replenishmentId: string): Promise<EncodingInfo | null> {
  const db = createAdminClient();
  const { data: rollover } = await db
    .from("sheet_rollovers")
    .select("status,error,report,created_at")
    .eq("replenishment_id", replenishmentId)
    .maybeSingle();
  if (!rollover) return null;
  const { data: operation } = await db
    .from("grokbot_operations")
    .select("status,error,report,updated_at")
    .eq("replenishment_id", replenishmentId)
    .maybeSingle();
  return info(operation, rollover.status, rollover.report, rollover.error, rollover.created_at);
}

// Approved liquidations in a replenishment that Grokbot has not yet written to
// the sheet. The green marker must come after them, so the replenishment waits.
export async function unencodedLiquidations(replenishmentId: string) {
  const db = createAdminClient();
  const { data: items } = await db
    .from("replenishment_items")
    .select("liquidation_id")
    .eq("replenishment_id", replenishmentId);
  const ids = (items ?? []).map((item) => item.liquidation_id).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];
  const { data: jobs } = await db
    .from("sheet_jobs")
    .select("liquidation_id,status")
    .in("liquidation_id", ids)
    .neq("status", "synced");
  const waiting = (jobs ?? []).map((job) => job.liquidation_id);
  if (waiting.length === 0) return [];
  const { data: liquidations } = await db
    .from("liquidations")
    .select("id,pcv_number")
    .in("id", waiting);
  return (liquidations ?? []).map((row) => ({ id: row.id, pcv_number: row.pcv_number }));
}

export function waitingMessage(rows: { pcv_number: string }[]) {
  const names = rows.map((row) => row.pcv_number).join(", ");
  return `Grokbot has not finished writing ${names} to Google Sheets yet. The green marker must come after those entries, so wait until they are encoded (or retry them from the liquidation page), then try again.`;
}
