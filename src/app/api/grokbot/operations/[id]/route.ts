import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { after } from "next/server";
import { dispatchGrokbot } from "@/lib/grokbot/delivery";
import {
  buyingSnapshotSchema,
  validateFinancialResult,
} from "@/lib/grokbot/results";
import { parseExpenseRows } from "@/lib/sheets/parser";
import { summarizeLedger } from "@/lib/sheets/ledger-summary";
import { sheetExpenseTags } from "@/lib/sheets/grid";
import { GROKBOT_BUYING_TARGET } from "@/lib/grokbot/contract";

async function authorize(request: Request, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (token.length < 32 || token.length > 200) return null;
  const db = createAdminClient();
  const { data, error } = await db
    .from("grokbot_operations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data || Date.parse(data.expires_at) < Date.now()) return null;
  const hash = Buffer.from(createHash("sha256").update(token).digest("hex"));
  const expected = Buffer.from(data.callback_hash ?? "");
  // timingSafeEqual throws on different lengths; a missing hash is a refusal.
  if (expected.length !== hash.length || !timingSafeEqual(hash, expected))
    return null;
  return { db, operation: data };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorize(request, (await params).id);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const part = new URL(request.url).searchParams.get("part");
  if (part === "routine") {
    const routine = await readFile(
      join(process.cwd(), "docs", "GROKBOT_BUYING_ROUTINE.md"),
      "utf8",
    );
    return new Response(routine, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  const base = `https://pcf.dryveph.io/api/grokbot/operations/${auth.operation.id}`;
  if (part === "payload") {
    const payload = auth.operation.payload as Record<string, Json>;
    return Response.json(
      {
        protocol_version: "pcf.grokbot.v1",
        operation_id: auth.operation.id,
        event:
          payload.event ??
          (auth.operation.kind === "workbook_refresh"
            ? "pcf.workbook.refresh"
            : "pcf.integration_test"),
        mode:
          auth.operation.kind === "integration_test"
            ? "test"
            : auth.operation.kind === "workbook_refresh"
              ? "dry_run"
              : "production",
        target: GROKBOT_BUYING_TARGET,
        payload,
        previous_report: auth.operation.report,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (part !== null)
    return Response.json(
      { error: "Unknown operation section" },
      { status: 400 },
    );
  return Response.json(
    {
      id: auth.operation.id,
      status: auth.operation.status,
      runner_claimed: Boolean(auth.operation.runner_id),
      next_action:
        auth.operation.status === "running"
          ? auth.operation.runner_id
            ? "resume_with_saved_runner_or_stop"
            : "claim_runner"
          : auth.operation.status === "queued"
            ? "wait_for_dispatch"
            : "return_saved_result",
      report: auth.operation.report,
      payload_url: base + "?part=payload",
      routine_url: base + "?part=routine",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorize(request, (await params).id);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Bound streamed requests as well as requests with Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing body" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 200000) {
      await reader.cancel();
      return Response.json({ error: "Report too large" }, { status: 413 });
    }
    chunks.push(value);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = z
    .object({
      operation_id: z.literal(auth.operation.id),
      status: z.enum(["running", "completed", "blocked", "failed"]),
      report: z.record(z.string(), z.unknown()).optional(),
      error: z.string().max(2000).optional(),
      runner_id: z.uuid().optional(),
    })
    .safeParse(body);
  if (!parsed.success)
    return Response.json({ error: "Invalid result" }, { status: 400 });
  if (["completed", "blocked", "failed"].includes(auth.operation.status))
    return Response.json({
      ok: true,
      already_recorded: true,
      status: auth.operation.status,
    });
  if (parsed.data.status === "completed" && !parsed.data.report)
    return Response.json(
      { error: "Completion report required" },
      { status: 400 },
    );
  const payload = auth.operation.payload as Record<string, Json>;
  const financial = ["liquidation_approved", "replenishment_approved"].includes(
    auth.operation.kind,
  );
  const controlled =
    financial ||
    auth.operation.kind === "workbook_refresh" ||
    payload?.source === "webapp-simulation";
  if (controlled) {
    const runner = parsed.data.runner_id;
    if (!runner)
      return Response.json({ error: "Runner ID required" }, { status: 400 });
    if (parsed.data.status === "running") {
      const claim = await auth.db.rpc("claim_grokbot_runner", {
        p_id: auth.operation.id,
        p_runner: runner,
      });
      if (claim.error || !claim.data)
        return Response.json(
          { error: "Operation owned by another runner" },
          { status: 409 },
        );
    } else if (auth.operation.runner_id !== runner) {
      return Response.json(
        { error: "Runner ownership mismatch" },
        { status: 409 },
      );
    }
    const report = parsed.data.report ?? {};
    if (parsed.data.status === "completed") {
      if (
        (financial || payload.source === "webapp-simulation") &&
        !validateFinancialResult(payload, report)
      )
        return Response.json(
          {
            error:
              "Verified amounts, audit evidence, target and required checks must match the operation",
          },
          { status: 422 },
        );
      if (auth.operation.kind === "workbook_refresh") {
        const snapshot = buyingSnapshotSchema.safeParse(report.snapshot);
        if (
          !snapshot.success ||
          report.verified !== true ||
          report.spreadsheet_id !== GROKBOT_BUYING_TARGET.spreadsheet_id ||
          report.sheet_id !== GROKBOT_BUYING_TARGET.sheet_id ||
          (report.checks as Record<string, unknown>)?.write_scope !== true
        )
          return Response.json(
            { error: "Complete verified Buying snapshot required" },
            { status: 422 },
          );
        const { grid } = snapshot.data;
        const summary = summarizeLedger(grid);
        if (
          !summary ||
          summary.formula_errors > 0 ||
          summary.balanced === false
        )
          return Response.json(
            { error: "Ledger snapshot has missing or inconsistent balances" },
            { status: 422 },
          );
        const expenses = parseExpenseRows(
          "buying",
          GROKBOT_BUYING_TARGET.sheet_id,
          GROKBOT_BUYING_TARGET.sheet_title,
          grid,
        );
        const tab = {
          sheetId: GROKBOT_BUYING_TARGET.sheet_id,
          title: GROKBOT_BUYING_TARGET.sheet_title,
          gridProperties: { rowCount: grid.length, columnCount: 30 },
          expenseTags: sheetExpenseTags(grid),
          ledger: summary,
          replenishmentNumber: Math.max(
            0,
            ...grid.map((row) => {
              const label =
                row[5]?.userEnteredValue?.stringValue ??
                row[5]?.formattedValue ??
                "";
              return Number(
                label.match(/^PCF REPLENISHMENT #(\d+)(?:\s|$)/i)?.[1] ?? 0,
              );
            }),
          ),
        };
        const saved = await auth.db.rpc("apply_grokbot_snapshot", {
          p_rows: expenses as unknown as Json,
          p_tab: tab as unknown as Json,
          p_token: String(payload.refresh_token),
        });
        if (saved.error)
          return Response.json(
            {
              error: "Could not save snapshot. Refresh lease may have changed.",
            },
            { status: 409 },
          );
      }
    }
    const saved = await auth.db.rpc("record_grokbot_result", {
      p_id: auth.operation.id,
      p_runner: runner,
      p_status: parsed.data.status,
      p_report: report as Json,
      p_error: parsed.data.error ?? "",
    });
    if (saved.error)
      return Response.json(
        { error: "Could not save owned operation result" },
        { status: 409 },
      );
    if (parsed.data.status !== "running") {
      if (
        auth.operation.kind === "workbook_refresh" &&
        parsed.data.status !== "completed"
      ) {
        await auth.db
          .from("sheet_workbooks")
          .update({
            refresh_until: null,
            sync_error: parsed.data.error ?? "Grokbot refresh needs review.",
          })
          .eq("id", "buying")
          .eq("refresh_token", String(payload.refresh_token));
      }
      after(async () => {
        try {
          if (financial && parsed.data.status === "completed") {
            const { refreshWorkbook } = await import("@/lib/sheets/refresh");
            await refreshWorkbook("buying");
          }
          await dispatchGrokbot();
        } catch {
          console.error(
            "Grokbot queue needs attention. Check saved operation status.",
          );
        }
      });
    }
    return Response.json({ ok: true });
  }
  const saved = await auth.db
    .from("grokbot_operations")
    .update({
      status: parsed.data.status,
      report: (parsed.data.report ?? null) as Json,
      error: parsed.data.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.operation.id)
    .in("status", ["queued", "running"]);
  if (saved.error)
    return Response.json({ error: "Could not save result" }, { status: 500 });
  return Response.json({ ok: true });
}
