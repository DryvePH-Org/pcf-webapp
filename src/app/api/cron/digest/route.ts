import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { sendDailyDigest } from "@/lib/notifications/digest";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return (
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  );
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const { recipients, stats } = await sendDailyDigest();
    return NextResponse.json({ ok: true, recipients, stats });
  } catch (error) {
    console.error("daily digest failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
