import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
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
  if (
    input.kind === "liquidation_approved" ||
    input.kind === "replenishment_approved"
  )
    grokbotFinancialEvent.parse(input.payload);
  const saved = await db.from("grokbot_operations").insert({
    id,
    kind: input.kind,
    spreadsheet_id: GROKBOT_BUYING_TARGET.spreadsheet_id,
    sheet_id: GROKBOT_BUYING_TARGET.sheet_id,
    callback_hash: createHash("sha256").update(token).digest("hex"),
    payload: input.payload as Json,
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
  const { url, secret } = configuration();
  const routine = await readFile(
    join(process.cwd(), "docs", "GROKBOT_BUYING_ROUTINE.md"),
    "utf8",
  );
  const db = createAdminClient();
  const claim = await db.rpc("claim_grokbot_dispatch");
  if (claim.error) throw new Error("Could not claim Grokbot delivery.");
  const operation = claim.data?.[0];
  if (!operation) return;
  const expiry = await db
    .from("grokbot_operations")
    .update({ expires_at: new Date(Date.now() + 2 * 3600000).toISOString() })
    .eq("id", operation.id);
  if (expiry.error) throw new Error("Could not prepare Grokbot callback.");
  const payload = operation.payload as Record<string, Json>;
  const event =
    payload.event ??
    (operation.kind === "workbook_refresh"
      ? "pcf.workbook.refresh"
      : "pcf.integration_test");
  const mode =
    operation.kind === "integration_test"
      ? "test"
      : operation.kind === "workbook_refresh"
        ? "dry_run"
        : "production";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        protocol_version: "pcf.grokbot.v1",
        operation_id: operation.id,
        event,
        mode,
        target: GROKBOT_BUYING_TARGET,
        required_editor_account: GROKBOT_EDITOR,
        audit_sheet_id: GROKBOT_AUDIT_SHEET_ID,
        callback: {
          url: `https://pcf.dryveph.io/api/grokbot/operations/${operation.id}`,
          token: grokbotCallbackToken(operation.id),
        },
        payload,
        previous_report: operation.report,
        message:
          "Execute the saved MAD PCF Buying routine. Use only the verified admin.manilaautodisplay@gmail.com Google connection. Before any work, GET callback status. A completed result ends the run. Generate a runner UUID for this run and POST status running with top-level runner_id. Continue only after HTTP 200. HTTP 409 means another runner owns this job and this run must stop. Include that same runner_id in every subsequent callback. Preserve prior report evidence for retries. Financial writes require append-only audit events in GROKBOT EDIT AUDIT, sheet ID 2133354940. Completed reports must include verified:true, editor_account, spreadsheet_id, sheet_id, rows_written, in_amount, out_amount, before_balance, after_balance, replenishment_number, audit_tab_id, audit_rows, and checks with all required checks true. Use exact decimal PHP strings for report amounts. For liquidation check all amounts, dates, numbering, running_balance, summary_formulas, input_vat_preserved, write_scope, duplicate_free. For replenishment also verify the green marker. For integration tests include restored:true and the same checks, plus the requested applied and restored evidence. Post a failed or blocked report if any check fails. A workbook refresh is strictly read-only, including the audit tab. Its completed report must include snapshot containing spreadsheet_id, sheet_id, sheet_title, and grid, a complete A1-based Cell[][] array with userEnteredValue, effectiveValue and formattedValue. Include all ledger, summary and signoff rows and relevant tag formula cells, up to 1000 rows and 30 columns. Use numeric effective values for computed cells. Do not truncate a larger sheet. Report blocked if the complete snapshot cannot fit the callback size limit. Read-only refreshes need verified:true, write_scope:true in checks, and the target IDs. Input VAT values always remain unchanged. Follow payload's narrower test scope and preconditions when supplied.\n\nCurrent complete routine follows.\n" +
          routine,
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
