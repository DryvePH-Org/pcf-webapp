import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

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
  const hash = createHash("sha256").update(token).digest("hex");
  if (!timingSafeEqual(Buffer.from(hash), Buffer.from(data.callback_hash)))
    return null;
  return { db, operation: data };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorize(request, (await params).id);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(
    {
      id: auth.operation.id,
      status: auth.operation.status,
      report: auth.operation.report,
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
