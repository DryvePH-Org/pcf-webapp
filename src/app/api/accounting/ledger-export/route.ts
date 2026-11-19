import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { withinLimit } from "@/lib/rate-limit";
import { buildLedgerExport } from "@/lib/export/build";
import { currentLedger } from "@/lib/export/ledger-fill";
import { MAX_TEMPLATE_BYTES, saveTemplate } from "@/lib/export/templates";

export const runtime = "nodejs";

const deny = () => NextResponse.json({ error: "Access denied" }, { status: 403 });

// ?fund=<id> downloads the Excel file; add &check=1 to get only the check report.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["admin", "accounting"].includes(user.role)) return deny();
  const url = new URL(request.url);
  const fund = z.uuid().safeParse(url.searchParams.get("fund"));
  if (!fund.success) return NextResponse.json({ error: "Choose a fund." }, { status: 400 });
  if (!(await withinLimit(`ledger:export:${user.id}`, 20, 60)))
    return NextResponse.json({ error: "Wait a minute before exporting again." }, { status: 429 });
  try {
    const built = await buildLedgerExport(fund.data);
    if (url.searchParams.get("check"))
      return NextResponse.json({ fund: built.fund, matches: built.matches, appClosing: built.appClosing, report: built.report });
    return new Response(new Uint8Array(built.buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${built.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not build the export." }, { status: 400 });
  }
}

// Admin uploads a fund's own .xlsx once; later exports fill it in.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return deny();
  if (request.headers.get("origin") !== new URL(process.env.APP_URL ?? request.url).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!(await withinLimit(`ledger:template:${user.id}`, 10, 60)))
    return NextResponse.json({ error: "Wait a minute before uploading again." }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const fund = z.uuid().safeParse(form?.get("fund"));
  const file = form?.get("file");
  if (!fund.success || !(file instanceof File)) return NextResponse.json({ error: "Choose a fund and an .xlsx file." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.size === 0 || file.size > MAX_TEMPLATE_BYTES)
    return NextResponse.json({ error: "Upload an Excel .xlsx file up to 15 MB." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  // Only a file with a ledger (a header row with DATE, OUT and BALANCE) can be filled in.
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
    if (!currentLedger(workbook)) throw new Error("no ledger");
  } catch {
    return NextResponse.json({ error: "That file has no ledger tab. It needs a header row with DATE, OUT and BALANCE." }, { status: 400 });
  }
  try {
    await saveTemplate({ fundId: fund.data, fileName: file.name, bytes, userId: user.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the template." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
