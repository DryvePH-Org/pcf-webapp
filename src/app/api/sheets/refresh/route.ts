import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sheetsAdmin } from "@/lib/sheets/database";
import { refreshWorkbook } from "@/lib/sheets/refresh";
import { withinLimit } from "@/lib/rate-limit";
import { GROKBOT_BOOKS, isGrokbotBook } from "@/lib/grokbot/targets";
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["admin", "accounting"].includes(user.role))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (
    request.headers.get("origin") !==
    new URL(process.env.APP_URL ?? request.url).origin
  )
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!(await withinLimit(`sheets:refresh:${user.id}`, 10, 60)))
    return NextResponse.json(
      { error: "Wait a minute before refreshing again." },
      { status: 429 },
    );
  const body = await request.json().catch(() => ({}));
  if (body.book && !isGrokbotBook(body.book))
    return NextResponse.json({ error: "Grokbot refresh is not configured for this workbook." }, { status: 400 });
  const db = sheetsAdmin();
  let query = db
    .from("sheet_workbooks")
    .select("id").in("id", GROKBOT_BOOKS)
    .order("last_synced_at", { ascending: true, nullsFirst: true });
  if (typeof body.book === "string" && body.book)
    query = query.eq("id", body.book);
  else if (body.background === true) query = query.limit(1);
  const { data, error } = await query;
  if (error || !data?.length)
    return NextResponse.json({ error: "Workbook not found" }, { status: 400 });
  after(async () => {
    for (const workbook of data) {
      try {
        await refreshWorkbook(workbook.id);
      } catch {
        console.error("Sheets background refresh failed; see workbook status.");
      }
    }
  });
  return NextResponse.json({ ok: true, count: data.length });
}
