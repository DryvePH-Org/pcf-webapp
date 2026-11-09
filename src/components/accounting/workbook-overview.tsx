import Link from "next/link";
import { MoneyText } from "@/components/shared/money-text";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import type { Workbook, SheetTab } from "@/lib/sheets/types";
import type { AccountingReport } from "@/lib/accounting";
export function WorkbookOverview({
  books,
  people,
  report,
}: {
  books: Workbook[];
  people: Map<string, string>;
  report: AccountingReport;
}) {
  const rows = books.map((book) => {
    const tab = (book.catalog as unknown as SheetTab[]).find(
      (item) => item.sheetId === book.active_sheet_id,
    );
    return {
      book,
      tab,
      ledger: tab?.ledger ?? null,
      period: report.by_workbook.find((item) => item.book_id === book.id),
    };
  });
  const amount = (value: number | null | undefined) =>
    value === null || value === undefined ? (
      <span className="text-muted-foreground">Unavailable</span>
    ) : (
      <MoneyText value={value} className="whitespace-nowrap" />
    );
  const state = (row: (typeof rows)[number]) => {
    if (row.book.refresh_until)
      return <Badge variant="secondary">Refresh requested</Badge>;
    if (row.book.sync_error)
      return <Badge variant="destructive">Refresh failed</Badge>;
    if (!row.tab)
      return <Badge variant="outline">Choose active worksheet</Badge>;
    if (row.ledger?.formula_errors)
      return <Badge variant="destructive">Formula issue</Badge>;
    if (row.ledger?.balanced === false)
      return <Badge variant="destructive">Check subtotal</Badge>;
    if (!row.ledger) return <Badge variant="outline">Refresh needed</Badge>;
    return <Badge variant="secondary">Snapshot available</Badge>;
  };
  const source = (row: (typeof rows)[number]) => (
    <a
      className="text-sm underline underline-offset-4"
      target="_blank"
      rel="noreferrer"
      href={`https://docs.google.com/spreadsheets/d/${row.book.spreadsheet_id}/edit${row.tab ? "#gid=" + row.tab.sheetId : ""}`}
    >
      Open workbook
    </a>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Current workbook balances</h2>
          <p className="text-sm text-muted-foreground">
            Latest synced balances from each active worksheet. Custodian filters
            use current workbook assignments.
          </p>
        </div>
        <Link
          className="text-sm underline underline-offset-4 print:hidden"
          href="/accounting/workbooks"
        >
          Manage assignments
        </Link>
      </div>
      <ResponsiveList
        rows={rows}
        getRowKey={(row) => row.book.id}
        columns={[
          {
            key: "book",
            header: "Workbook / custodian",
            cell: (row) => (
              <div className="space-y-2">
                <p className="font-medium">{row.book.name}</p>
                <p className="text-xs text-muted-foreground">
                  {people.get(row.book.custodian_id ?? "") ?? "Unassigned"}
                </p>
                {state(row)}
              </div>
            ),
          },
          {
            key: "worksheet",
            header: "Active worksheet",
            cell: (row) => (
              <div className="space-y-2">
                <p className="max-w-44 whitespace-normal">
                  {row.tab?.title ?? "Not selected"}
                </p>
                {source(row)}
                <p className="text-xs text-muted-foreground">
                  {row.book.last_synced_at
                    ? formatDateTime(row.book.last_synced_at)
                    : "Not imported yet"}
                </p>
              </div>
            ),
          },
          {
            key: "period",
            header: "Selected period",
            headerClassName: "text-right",
            className: "text-right",
            cell: (row) => (
              <>
                <MoneyText value={row.period?.amount ?? 0} />
                <p className="text-xs text-muted-foreground">
                  {row.period?.count ?? 0} entries
                </p>
              </>
            ),
          },
          {
            key: "balance",
            header: "Ledger balance",
            headerClassName: "text-right",
            className: "text-right",
            cell: (row) => amount(row.ledger?.ledger_balance),
          },
          {
            key: "cash",
            header: "Cash on hand",
            headerClassName: "text-right",
            className: "text-right",
            cell: (row) => amount(row.ledger?.cash_on_hand),
          },
          {
            key: "unliquidated",
            header: "Unliquidated",
            headerClassName: "text-right",
            className: "text-right",
            cell: (row) => amount(row.ledger?.unliquidated),
          },
        ]}
        renderCard={(row) => (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-medium">{row.book.name}</h3>
                {state(row)}
              </div>
              <p className="text-sm text-muted-foreground">
                {people.get(row.book.custodian_id ?? "") ?? "Unassigned"} ·{" "}
                {row.tab?.title ?? "Active worksheet not selected"}
              </p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Ledger balance", row.ledger?.ledger_balance],
                  ["Cash on hand", row.ledger?.cash_on_hand],
                  ["Unliquidated", row.ledger?.unliquidated],
                  ["Selected-period expenses", row.period?.amount ?? 0],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-medium">
                      {amount(value as number | null | undefined)}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {source(row)}
                <span className="text-xs text-muted-foreground">
                  {row.book.last_synced_at
                    ? formatDateTime(row.book.last_synced_at)
                    : "Not imported yet"}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      />
      <p className="text-xs text-muted-foreground">
        Unavailable means the worksheet has no readable value or a formula needs
        attention. Ledger balance and cash on hand follow their separate source
        fields.
      </p>
    </div>
  );
}
