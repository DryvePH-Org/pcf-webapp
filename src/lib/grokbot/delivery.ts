import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/database.types";
import { grokbotFinancialEvent } from "./contract";
import { targetForBook, targetForSpreadsheet, type GrokbotBook } from "./targets";

export const GROKBOT_EDITOR = "admin.manilaautodisplay@gmail.com";
export const GROKBOT_AUDIT_SHEET_ID = 2133354940;

// Each sheet has its own bot, with its own webhook URL and secret.
function configuration(book: GrokbotBook = "buying") {
  const { env } = targetForBook(book);
  const url = process.env[env.url];
  const secret = process.env[env.secret];
  if (!url || !secret) throw new Error("Grokbot webhook is not configured.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "api2.cursor.sh")
    throw new Error("Grokbot webhook destination is invalid.");
  return { url, secret };
}

// The book an operation belongs to, from the sheet it targets.
function bookOf(operation: { spreadsheet_id?: string | null; sheet_id?: number | null }): GrokbotBook {
  if (!operation.spreadsheet_id) return "buying";
  const target = targetForSpreadsheet(operation.spreadsheet_id, operation.sheet_id ?? undefined);
  if (!target) throw new Error("Grokbot is not configured for this destination.");
  return target.book;
}

export function grokbotCallbackToken(id: string, book: GrokbotBook = "buying") {
  return createHmac("sha256", configuration(book).secret)
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
  book?: GrokbotBook;
  payload: Record<string, unknown>;
  liquidationId?: string;
  replenishmentId?: string;
}) {
  const payload =
    input.kind === "liquidation_approved" ||
    input.kind === "replenishment_approved"
      ? grokbotFinancialEvent.parse(input.payload)
      : input.payload;
  // An operation belongs to the sheet its own payload names (that is what the bot is
  // told to write to); a caller that also names a book must agree with it.
  const named = (payload as { target?: { spreadsheet_id?: string; sheet_id?: number } }).target;
  const target = named?.spreadsheet_id
    ? targetForSpreadsheet(named.spreadsheet_id, named.sheet_id)
    : targetForBook(input.book ?? "buying");
  if (!target) throw new Error("Grokbot is not configured for this destination.");
  if (input.book && input.book !== target.book)
    throw new Error("The operation names a different sheet than the one requested.");
  const book = target.book;
  configuration(book);
  const db = createAdminClient();
  const id = input.id ?? randomUUID();
  const token = grokbotCallbackToken(id, book);
  const saved = await db.from("grokbot_operations").insert({
    id,
    kind: input.kind,
    spreadsheet_id: target.spreadsheet_id,
    sheet_id: target.sheet_id,
    callback_hash: createHash("sha256").update(token).digest("hex"),
    payload: payload as Json,
    liquidation_id: input.liquidationId,
    replenishment_id: input.replenishmentId,
    expires_at: new Date(Date.now() + 2 * 3600000).toISOString(),
  });
  if (saved.error) {
    if (saved.error.code !== "23505")
      throw new Error("Could not queue Grokbot delivery.");
    let query = db.from("grokbot_operations").select("id,status,spreadsheet_id,sheet_id");
    if (input.liquidationId)
      query = query.eq("liquidation_id", input.liquidationId);
    else if (input.replenishmentId)
      query = query.eq("replenishment_id", input.replenishmentId);
    else query = query.eq("id", id);
    const existing = await query.single();
    if (existing.error)
      throw new Error("Could not reconcile the queued operation.");
    // An operation saved against the wrong sheet (before it was routed by its payload) is moved
    // to the sheet its payload names, but only while it is waiting or has stopped.
    if (
      (existing.data.spreadsheet_id !== target.spreadsheet_id || existing.data.sheet_id !== target.sheet_id) &&
      ["queued", "blocked", "failed"].includes(existing.data.status)
    ) {
      const moved = await db
        .from("grokbot_operations")
        .update({ spreadsheet_id: target.spreadsheet_id, sheet_id: target.sheet_id })
        .eq("id", existing.data.id);
      if (moved.error) throw new Error("Could not correct the saved destination.");
    }
    return existing.data.id;
  }
  return id;
}

// Claim under a database lock: a sheet takes one operation at a time, and different
// sheets (each with its own bot) can run side by side.
export async function dispatchGrokbot() {
  const db = createAdminClient();
  const seen = new Set<string>();
  for (let round = 0; round < 4; round++) {
    const claim = await db.rpc("claim_grokbot_dispatch");
    if (claim.error) throw new Error("Could not claim Grokbot delivery.");
    const operation = claim.data?.[0];
    if (!operation || seen.has(operation.id)) return;
    seen.add(operation.id);
    await deliverOperation(operation);
  }
}

async function deliverOperation(
  operation: Database["public"]["Tables"]["grokbot_operations"]["Row"],
) {
  const book = bookOf(operation);
  // Never hand a bot a job addressed to another sheet.
  const declared = (operation.payload as { target?: { spreadsheet_id?: string } } | null)?.target?.spreadsheet_id;
  if (declared && declared !== operation.spreadsheet_id)
    throw new Error("This operation's payload names a different sheet than its destination.");
  const { url, secret } = configuration(book);
  const db = createAdminClient();
  const expiry = await db
    .from("grokbot_operations")
    .update({
      expires_at: new Date(Date.now() + 2 * 3600000).toISOString(),
      callback_hash: createHash("sha256")
        .update(grokbotCallbackToken(operation.id, book))
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
          token: grokbotCallbackToken(operation.id, book),
        },
        message:
          "GET callback.url with Authorization: Bearer callback.token. running alone means dispatched. When runner_claimed=false, claim a runner. Fetch payload_url and routine_url with the same header. Download both completely. Persist a fresh runner UUID in a private per-run file before POST status running with that runner_id. Continue only after HTTP 200, stop on 409. Reuse the saved UUID in every callback. Follow the downloaded routine and payload.",
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
