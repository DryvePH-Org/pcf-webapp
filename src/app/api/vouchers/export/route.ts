import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { canAccessRoute } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { applyVoucherFilters } from "@/lib/voucher-filters";
import { isVoucherStatus, VOUCHER_STATUS_LABELS } from "@/lib/voucher-status";

export const dynamic = "force-dynamic";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

// The vouchers CSV, made when someone asks for it. The list page used to read up to 5,000 vouchers on every visit
// just in case the button was pressed, which made the page slower and heavier as the records grew.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canAccessRoute(user.role, "/vouchers")) return Response.json({ error: "Sign in to export vouchers." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const statusParam = params.get("status") ?? undefined;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const filters = {
    status: isVoucherStatus(statusParam) ? statusParam : undefined,
    q: (params.get("q") ?? "").trim().slice(0, 100),
    from: datePattern.test(from) ? from : "",
    to: datePattern.test(to) ? to : "",
  };
  const supabase = await createClient();
  const [vouchers, categories, funds] = await Promise.all([
    applyVoucherFilters(
      supabase.from("vouchers").select("pcv_number, voucher_date, payee, particulars, amount, status, category_id, fund_id"),
      filters,
    )
      .order("voucher_date", { ascending: false })
      .limit(5000),
    supabase.from("categories").select("id, name"),
    supabase.from("funds").select("id, name"),
  ]);
  if (vouchers.error || categories.error || funds.error) return Response.json({ error: "Could not export the vouchers." }, { status: 500 });
  const categoryNames = new Map(categories.data.map((row) => [row.id, row.name]));
  const fundNames = new Map(funds.data.map((row) => [row.id, row.name]));
  const csv = toCsv(
    ["PCV Number", "Date", "Payee", "Particulars", "Category", "Fund", "Amount", "Status"],
    vouchers.data.map((voucher) => [
      voucher.pcv_number,
      voucher.voucher_date,
      voucher.payee,
      voucher.particulars,
      categoryNames.get(voucher.category_id) ?? "—",
      fundNames.get(voucher.fund_id) ?? "—",
      voucher.amount,
      isVoucherStatus(voucher.status) ? VOUCHER_STATUS_LABELS[voucher.status] : voucher.status,
    ]),
  );
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": 'attachment; filename="vouchers.csv"',
      "Cache-Control": "no-store",
    },
  });
}
