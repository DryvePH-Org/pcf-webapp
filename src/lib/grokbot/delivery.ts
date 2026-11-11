import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/database.types";
import { GROKBOT_BUYING_TARGET, grokbotFinancialEvent } from "./contract";

export const GROKBOT_EDITOR = "admin.manilaautodisplay@gmail.com";
export const GROKBOT_AUDIT_SHEET_ID = 2133354940;

function configuration() {
  const url = process.env.GROKBOT_WEBHOOK_URL;
  const secret = process.env.GROKBOT_WEBHOOK_SECRET;
  if (!url || !secret) throw new Error("Grokbot webhook is not configured.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "api2.cursor.sh")
    throw new Error("Grokbot webhook destination is invalid.");
  return { url, secret };
}

export function grokbotCallbackToken(id: string) {
  return createHmac("sha256", configuration().secret)
    .update(`pcf.grokbot.v1:${id}`)
    .digest("hex");
}

export async function queueGrokbotOperation(input: {
  kind:
    | "liquidation_approved"
    | "replenishment_approved"
    | "workbook_refresh"
    | "integration_test";
  id?: string;
  payload: Record<string, unknown>;
  liquidationId?: string;
  replenishmentId?: string;
}) {
  configuration();
  const db = createAdminClient();
  const id = input.id ?? randomUUID();
  const token = grokbotCallbackToken(id);
  const payload =
    input.kind === "liquidation_approved" ||
    input.kind === "replenishment_approved"
      ? grokbotFinancialEvent.parse(input.payload)
      : input.payload;
  const saved = await db.from("grokbot_operations").insert({
    id,
    kind: input.kind,
    spreadsheet_id: GROKBOT_BUYING_TARGET.spreadsheet_id,
    sheet_id: GROKBOT_BUYING_TARGET.sheet_id,
    callback_hash: createHash("sha256").update(token).digest("hex"),
    payload: payload as Json,
    liquidation_id: input.liquidationId,
    replenishment_id: input.replenishmentId,
    expires_at: new Date(Date.now() + 2 * 3600000).toISOString(),
  });
  if (saved.error) {
    if (saved.error.code !== "23505")
      throw new Error("Could not queue Grokbot delivery.");
    let query = db.from("grokbot_operations").select("id,status");
    if (input.liquidationId)
      query = query.eq("liquidation_id", input.liquidationId);
    else if (input.replenishmentId)
      query = query.eq("replenishment_id", input.replenishmentId);
    else query = query.eq("id", id);
    const existing = await query.single();
    if (existing.error)
      throw new Error("Could not reconcile the queued operation.");
    return existing.data.id;
  }
  return id;
}

// Claim under a database lock so concurrent requests dispatch one destination at a time.
export async function dispatchGrokbot() {
  configuration();
  const db = createAdminClient();
  const claim = await db.rpc("claim_grokbot_dispatch");
  if (claim.error) throw new Error("Could not claim Grokbot delivery.");
  const operation = claim.data?.[0];
  if (operation) await deliverOperation(operation);
}

async function deliverOperation(
  operation: Database["public"]["Tables"]["grokbot_operations"]["Row"],
) {
  const { url, secret } = configuration();
  const db = createAdminClient();
  const expiry = await db
    .from("grokbot_operations")
    .update({
      expires_at: new Date(Date.now() + 2 * 3600000).toISOString(),
      callback_hash: createHash("sha256")
        .update(grokbotCallbackToken(operation.id))
        .digest("hex"),
    })
    .eq("id", operation.id);
  if (expiry.error) throw new Error("Could not prepare Grokbot callback.");
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operation_id: operation.id,
        callback: {
          url: `https://pcf.dryveph.io/api/grokbot/operations/${operation.id}`,
          token: grokbotCallbackToken(operation.id),
        },
        message:
          "GET callback.url with Authorization: Bearer callback.token. Fetch payload_url and routine_url from that response with the same header. Download both completely. This notification carries no financial data. Persist a fresh runner UUID in a private per-run file before claiming. Reuse that UUID in every callback. Follow the fetched routine and payload.",
      }),
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Webhook did not acknowledge delivery.");
    const acknowledgement = await response.json();
    if (acknowledgement.success !== true)
      throw new Error("Webhook acknowledgement is incomplete.");
  } catch {
    // An interrupted request may already have started a runner. Keep its stable ID active.
    await db
      .from("grokbot_operations")
      .update({
        error:
          "Webhook acknowledgement is uncertain. Check Grokbot before retrying this operation.",
      })
      .eq("id", operation.id)
      .eq("status", "running");
  }
}

export async function retryGrokbotOperation(id: string) {
  const db = createAdminClient();
  const existing = await db
    .from("grokbot_operations")
    .select("*")
    .eq("id", id)
    .single();
  if (existing.error) throw new Error("Could not read the saved operation.");
  if (existing.data.status === "running" && existing.data.runner_id === null) {
    // A delayed first webhook and this retry still compete for the same runner claim.
    await deliverOperation(existing.data);
    return;
  }
  const saved = await db
    .from("grokbot_operations")
    .update({
      status: "queued",
      runner_id: null,
      error: null,
      expires_at: new Date(Date.now() + 2 * 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["blocked", "failed"]);
  if (saved.error)
    throw new Error("Could not queue the saved operation for reconciliation.");
}
