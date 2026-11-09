import { getCurrentUser } from "@/lib/auth";
import {
  loadAccountingFilters,
  loadAccountingReport,
} from "@/lib/accounting-data";
import { toCsv } from "@/lib/csv";
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["admin", "accounting"].includes(user.role))
    return Response.json(
      { error: "Accounting access required." },
      { status: 403 },
    );
  const params = Object.fromEntries(new URL(request.url).searchParams);
  try {
    const { filters, error } = await loadAccountingFilters(params);
    if (error) return Response.json({ error }, { status: 400 });
    const report = await loadAccountingReport(filters, true);
    const csv = toCsv(
      [
        "Workbook",
        "Current custodian",
        "Worksheet",
        "Source row",
        "Expense date",
        "Voucher",
        "Receipt number",
        "Tag",
        "Particulars",
        "Point person",
        "Supplier",
        "TIN",
        "Address",
        "Plate",
        "Company",
        "Amount",
        "Source",
      ],
      report.rows.map((row) => [
        row.workbook_name,
        row.custodian_name ?? "Unassigned",
        row.sheet_name,
        row.source_row,
        row.expense_date ?? "",
        row.voucher,
        row.receipt_number,
        row.category,
        row.particulars,
        row.person,
        row.supplier,
        row.tin,
        row.address,
        row.plate,
        row.company,
        row.amount,
        `https://docs.google.com/spreadsheets/d/${row.spreadsheet_id}/edit#gid=${row.sheet_id}&range=A${row.source_row}`,
      ]),
    );
    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="accounting-expenses.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not export these expenses.",
      },
      { status: 400 },
    );
  }
}
