import { timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { realDeps } from "@/lib/telegram/deps";
import { handleUpdate, updateSchema } from "@/lib/telegram/flow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Telegram calls this for every message to the bot. It proves who it is with a secret header that only the server
// and Telegram know; anything else is refused. The answer goes back at once and the work (listening to a voice
// message can take several seconds) continues after it, so Telegram never retries a slow one.
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !process.env.TELEGRAM_BOT_TOKEN) return new Response(null, { status: 503 });
  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response(null, { status: 401 });
  if (Number(request.headers.get("content-length")) > 200_000) return new Response(null, { status: 413 });

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  // an update this bot does not use (a sticker, an edited message) is acknowledged and ignored
  if (!parsed.success) return Response.json({ ok: true });

  after(async () => {
    try {
      await handleUpdate(parsed.data, realDeps());
    } catch (error) {
      console.error("telegram update failed", error instanceof Error ? error.message : "unknown error");
    }
  });
  return Response.json({ ok: true });
}
