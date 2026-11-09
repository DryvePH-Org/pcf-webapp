import Link from "next/link";
import { Files, Settings2, ArrowDown } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  loadAccountingFilters,
  loadAccountingReport,
} from "@/lib/accounting-data";
import { accountingUrl } from "@/lib/accounting";
import type { Workbook, SheetTab } from "@/lib/sheets/types";
import { formatDate, formatMonth } from "@/lib/dates";
import { PageHeader } from "@/components/layout/page-header";
import { PrintButton } from "@/components/layout/print-button";
import { AccountingFilterForm } from "@/components/accounting/filters";
import { AccountingExportButton } from "@/components/accounting/export-button";
import { WorkbookOverview } from "@/components/accounting/workbook-overview";
import { SheetsRefresh } from "@/components/sheets/refresh-control";
import { RolloverRetry } from "@/components/sheets/rollover-retry";
import { MoneyText } from "@/components/shared/money-text";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireUser("/accounting");
  const params = await searchParams;
  const db = await createClient();
  const [normalized, workbooks, profiles] = await Promise.all([
    loadAccountingFilters(params),
    db.from("sheet_workbooks").select("*").order("name"),
    db.from("profiles").select("id,full_name,role").order("full_name"),
  ]);
  if (workbooks.error || profiles.error)
    throw new Error("Could not load the Accounting dashboard.");
  const { filters, error } = normalized;
  const books = workbooks.data as Workbook[];
  const people = new Map(
    profiles.data.map((person) => [person.id, person.full_name]),
  );
  const scopedBooks = books.filter(
    (book) =>
      (!filters.book || book.id === filters.book) &&
      (!filters.custodian ||
        (filters.custodian === "unassigned"
          ? book.custodian_id === null
          : book.custodian_id === filters.custodian)),
  );
  if (error)
    return (
      <div className="space-y-6">
        <PageHeader
          title="Accounting"
          description="Combined PCF records across all Google workbooks."
        />
        <Alert variant="destructive">
          <AlertTitle>Check the filters</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/accounting" />}
        >
          Reset filters
        </Button>
      </div>
    );
  const report = await loadAccountingReport(filters);
  let pendingQuery = db
    .from("sheet_rollovers")
    .select("id,replenishment_id,target_name,error,book_id", { count: "exact" })
    .eq("status", "pending")
    .order("created_at")
    .limit(5);
  pendingQuery = pendingQuery.in(
    "book_id",
    scopedBooks.map((book) => book.id),
  );
  const pending = await pendingQuery;
  if (pending.error)
    throw new Error("Could not read pending worksheet updates.");
  const periodLabel =
    filters.date_status === "missing"
      ? "Entries without valid dates"
      : filters.period === "all"
        ? "All history"
        : `${filters.from ? formatDate(filters.from) : "Beginning"} – ${filters.to ? formatDate(filters.to) : "Latest"}`;
  const selectedBook = books.find((book) => book.id === filters.book);
  const source = (row: (typeof report.rows)[number]) =>
    `https://docs.google.com/spreadsheets/d/${row.spreadsheet_id}/edit#gid=${row.sheet_id}&range=A${row.source_row}`;
  const lastPage = Math.max(1, Math.ceil(report.totals.expense_count / 50));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting"
        description="Expense records and worksheet balances across every PCF workbook."
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/accounting/workbooks" />}
            >
              <Settings2 />
              Workbook assignments
            </Button>
            <PrintButton />
          </>
        }
      />
      <AccountingFilterForm
        key={JSON.stringify(filters)}
        filters={filters}
        books={books.map((book) => ({
          id: book.id,
          name: book.name,
          catalog: book.catalog as unknown as SheetTab[],
        }))}
        custodians={profiles.data
          .filter(
            (person) =>
              person.role === "custodian" ||
              books.some((book) => book.custodian_id === person.id),
          )
          .map((person) => ({ id: person.id, name: person.full_name }))}
        categories={report.categories}
        companies={report.companies}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-medium">
            {selectedBook?.name ?? "All workbooks"} ·{" "}
            {filters.custodian === "unassigned"
              ? "Unassigned workbooks"
              : people.get(filters.custodian) || "All custodians"}
          </p>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        <SheetsRefresh book={filters.book} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Recorded expenses</CardDescription>
            <CardTitle className="text-2xl">
              <MoneyText value={report.totals.amount} />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            OUT amounts across every matching entry
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Expense entries</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {report.totals.expense_count.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {report.totals.vouchers} voucher references ·{" "}
            {report.totals.suppliers} suppliers
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>CE expenses</CardDescription>
            <CardTitle className="text-2xl">
              <MoneyText value={report.totals.ce_amount} />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Exact CE tags from the workbooks
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>NCE expenses</CardDescription>
            <CardTitle className="text-2xl">
              <MoneyText value={report.totals.nce_amount} />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Exact NCE tags from the workbooks
          </CardContent>
        </Card>
      </div>
      {report.totals.missing_receipt_numbers ||
      report.totals.missing_tags ||
      report.undated_scope ? (
        <Alert>
          <AlertTitle>Records to check</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {report.totals.missing_receipt_numbers ? (
                <Link
                  className="underline"
                  href={accountingUrl(filters, { receipt: "missing", page: 1 })}
                >
                  {report.totals.missing_receipt_numbers} entries without
                  receipt numbers
                </Link>
              ) : null}
              {report.totals.missing_tags ? (
                <span>{report.totals.missing_tags} entries without tags</span>
              ) : null}
              {report.undated_scope ? (
                <Link
                  className="underline"
                  href={accountingUrl(filters, {
                    period: "all",
                    date_status: "missing",
                    page: 1,
                  })}
                >
                  {report.undated_scope} undated entries in this search scope
                </Link>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      <nav
        aria-label="Accounting sections"
        className="flex flex-wrap gap-2 print:hidden"
      >
        {[
          ["expenses", "Expense records"],
          ["workbooks", "Workbook balances"],
          ["breakdowns", "Spending breakdowns"],
        ].map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<a href={`#${id}`} />}
          >
            <ArrowDown />
            {label}
          </Button>
        ))}
      </nav>
      <section id="expenses" className="scroll-mt-20 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Expense records</h2>
            <p className="text-sm text-muted-foreground">
              {report.totals.expense_count} matching entries · Page{" "}
              {filters.page} of {lastPage}
            </p>
          </div>
          <div className="print:hidden">
            <AccountingExportButton
              disabled={!report.totals.expense_count}
              url={accountingUrl(filters, {}, "/api/accounting/export")}
            />
          </div>
        </div>
        {report.hidden_copies ? (
          <p className="text-sm text-muted-foreground">
            {report.hidden_copies} exact cross-worksheet copies hidden.{" "}
            <Link
              className="underline"
              href={accountingUrl(filters, { repeats: true, page: 1 })}
            >
              Include source copies
            </Link>
          </p>
        ) : null}
        <ResponsiveList
          rows={report.rows}
          getRowKey={(row) =>
            `${row.book_id}:${row.sheet_id}:${row.source_row}`
          }
          columns={[
            {
              key: "source",
              header: "Source",
              cell: (row) => (
                <div className="space-y-1">
                  <a
                    className="font-medium underline underline-offset-4"
                    target="_blank"
                    rel="noreferrer"
                    href={source(row)}
                  >
                    {row.workbook_name}
                  </a>
                  <p className="max-w-40 whitespace-normal text-xs text-muted-foreground">
                    {row.sheet_name} · row {row.source_row}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.custodian_name ?? "Unassigned"}
                  </p>
                </div>
              ),
            },
            {
              key: "date",
              header: "Date / documents",
              cell: (row) => (
                <div className="space-y-1">
                  <p className="whitespace-nowrap">
                    {row.expense_date
                      ? formatDate(row.expense_date)
                      : "Date missing"}
                  </p>
                  <p className="font-mono text-xs">
                    {row.voucher || "Voucher not recorded"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Receipt {row.receipt_number || "not recorded"}
                  </p>
                </div>
              ),
            },
            {
              key: "particulars",
              header: "Particulars / tag",
              className: "min-w-48 max-w-sm whitespace-normal",
              cell: (row) => (
                <div className="space-y-2">
                  <p className="whitespace-pre-wrap">{row.particulars}</p>
                  <Badge variant="outline">
                    {row.category || "Unclassified"}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {row.company}
                    {row.plate ? ` · ${row.plate}` : ""}
                  </p>
                </div>
              ),
            },
            {
              key: "supplier",
              header: "People / supplier",
              cell: (row) => (
                <div className="max-w-48 space-y-1 whitespace-normal">
                  <p>{row.person || "Person not recorded"}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.supplier || "Supplier not recorded"}
                  </p>
                  {row.tin ? (
                    <p className="text-xs text-muted-foreground">
                      TIN {row.tin}
                    </p>
                  ) : null}
                  {row.address ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Supplier address
                      </summary>
                      {row.address}
                    </details>
                  ) : null}
                </div>
              ),
            },
            {
              key: "amount",
              header: "Amount",
              headerClassName: "text-right",
              className: "text-right whitespace-nowrap",
              cell: (row) => <MoneyText value={row.amount} />,
            },
          ]}
          renderCard={(row) => (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap justify-between gap-2">
                  <span className="min-w-0 break-words font-mono">
                    {row.voucher || "Expense"}
                  </span>
                  <MoneyText value={row.amount} className="whitespace-nowrap" />
                </CardTitle>
                <CardDescription>
                  {row.expense_date
                    ? formatDate(row.expense_date)
                    : "Date missing"}{" "}
                  · {row.category || "Unclassified"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="break-words whitespace-pre-wrap">
                  {row.particulars}
                </p>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Point person", row.person],
                    ["Supplier", row.supplier],
                    ["Receipt number", row.receipt_number],
                    ["Plate", row.plate],
                    ["TIN", row.tin],
                    ["Company", row.company],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="break-words">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
                <a
                  className="block break-words text-sm underline underline-offset-4"
                  target="_blank"
                  rel="noreferrer"
                  href={source(row)}
                >
                  {row.workbook_name} · {row.sheet_name} · row {row.source_row}
                </a>
                <p className="text-xs text-muted-foreground">
                  Custodian {row.custodian_name ?? "Unassigned"}
                </p>
              </CardContent>
            </Card>
          )}
          empty={
            <EmptyState
              icon={Files}
              title="No matching expenses"
              description="Change the period or filters, or refresh the workbooks to import their latest records."
            />
          }
        />
        <div className="flex justify-between gap-3 print:hidden">
          {filters.page > 1 ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={accountingUrl(filters, { page: filters.page - 1 })}
                />
              }
            >
              Previous
            </Button>
          ) : (
            <span />
          )}
          {filters.page < lastPage ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={accountingUrl(filters, { page: filters.page + 1 })}
                />
              }
            >
              Next
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Totals cover all matching entries. Printing shows this page. CSV
          exports all filtered entries. Consolidation hides exact copies across
          worksheets only when a dated voucher or receipt reference matches.
          Repeated lines within one worksheet are retained.
        </p>
      </section>
      <section id="workbooks" className="scroll-mt-20">
        <WorkbookOverview books={scopedBooks} people={people} report={report} />
      </section>
      {pending.data.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending replenishment worksheets</CardTitle>
            <CardDescription>
              {pending.count} worksheet updates need attention.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pending.data.map((item) => (
              <div key={item.id} className="space-y-2 border-t pt-3">
                <Link
                  className="text-sm underline"
                  href={`/replenishments/${item.replenishment_id}`}
                >
                  {item.target_name ?? "Review replenishment"}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {item.error ?? "Waiting for worksheet creation"}
                </p>
                <RolloverRetry id={item.replenishment_id} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <section
        id="breakdowns"
        className="grid scroll-mt-20 gap-6 lg:grid-cols-2"
      >
        <Card>
          <CardHeader>
            <CardTitle>Expenses by tag</CardTitle>
            <CardDescription>
              Largest eight tags in the filtered results
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.by_category.length ? (
              report.by_category.map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span>{item.label}</span>
                    <MoneyText value={item.amount} />
                  </div>
                  <progress
                    aria-label={item.label}
                    className="h-2 w-full accent-primary"
                    value={Number(item.amount)}
                    max={Number(report.by_category[0].amount)}
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No expenses for this selection.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Monthly expenses</CardTitle>
            <CardDescription>Latest twelve matching months</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.by_month.length ? (
              report.by_month.map((item) => (
                <div
                  key={item.month}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-sm"
                >
                  <Link
                    className="underline underline-offset-4"
                    href={accountingUrl(filters, {
                      period: "month",
                      month: item.month,
                      page: 1,
                    })}
                  >
                    {formatMonth(item.month)}
                  </Link>
                  <span className="text-muted-foreground">
                    {item.count} entries
                  </span>
                  <MoneyText value={item.amount} />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No dated expenses for this selection.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
