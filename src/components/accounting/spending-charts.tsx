import Link from "next/link";
import { BarChart3, TrendingUp, Tags } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MoneyText } from "@/components/shared/money-text";
import {
  accountingUrl,
  type AccountingFilters,
  type AccountingReport,
} from "@/lib/accounting";
import { formatMonth } from "@/lib/dates";

const workbookColors: Record<string, string> = {
  operations: "bg-blue-500",
  buying: "bg-violet-500",
  selling: "bg-emerald-500",
  lmr: "bg-amber-500",
  dryve: "bg-cyan-500",
};
export function SpendingCharts({
  report,
  books,
  filters,
}: {
  report: AccountingReport;
  books: { id: string; name: string }[];
  filters: AccountingFilters;
}) {
  const months = report.by_month;
  const maximum = Math.max(...months.map((item) => Number(item.amount)), 1);
  const bookMaximum = Math.max(
    ...report.by_workbook.map((item) => Number(item.amount)),
    1,
  );
  const tagMaximum = Math.max(
    ...report.by_category.map((item) => Number(item.amount)),
    1,
  );
  return (
    <section
      id="breakdowns"
      aria-label="Workbook spending charts"
      className="grid scroll-mt-20 gap-4 xl:grid-cols-3"
    >
      <Card className="min-w-0 border-t-4 border-t-blue-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-4 text-blue-600 dark:text-blue-400" />
            Spending by workbook
          </CardTitle>
          <CardDescription>
            Selected period · click a workbook to filter
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {report.by_workbook.length ? (
            report.by_workbook.map((item) => (
              <Link
                key={item.book_id}
                href={accountingUrl(filters, {
                  book: item.book_id,
                  tab: "",
                  page: 1,
                })}
                className="block space-y-2 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {books.find((book) => book.id === item.book_id)?.name ??
                      item.book_id}
                  </span>
                  <MoneyText value={item.amount} />
                </div>
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-muted"
                  aria-hidden="true"
                >
                  <div
                    className={`h-full rounded-full ${workbookColors[item.book_id] ?? "bg-blue-500"}`}
                    style={{
                      width: `${(Number(item.amount) / bookMaximum) * 100}%`,
                    }}
                  />
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No workbook expenses for this selection.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="min-w-0 border-t-4 border-t-violet-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-4 text-violet-600 dark:text-violet-400" />
            Monthly spending
          </CardTitle>
          <CardDescription>
            Latest twelve matching months · oldest to newest
          </CardDescription>
        </CardHeader>
        <CardContent>
          {months.length ? (
            <>
              <svg
                viewBox="0 0 320 210"
                role="img"
                aria-label="Monthly expense amounts"
                className="w-full overflow-visible"
              >
                <line
                  x1="12"
                  y1="170"
                  x2="308"
                  y2="170"
                  className="stroke-border"
                />
                {months.map((item, index) => {
                  const slot = 296 / months.length,
                    height = (Number(item.amount) / maximum) * 140,
                    x = 12 + index * slot;
                  return (
                    <g key={item.month}>
                      <title>
                        {formatMonth(item.month)} · PHP{" "}
                        {Number(item.amount).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        · {item.count} entries
                      </title>
                      {months.length <= 6 || index % 2 === 0 ? (
                        <text
                          x={x + slot * 0.5}
                          y={162 - height}
                          textAnchor="middle"
                          className="fill-foreground"
                          fontSize={months.length > 6 ? 10 : 12}
                        >
                          {new Intl.NumberFormat("en-PH", {
                            style: "currency",
                            currency: "PHP",
                            notation: "compact",
                            maximumFractionDigits: 1,
                          }).format(Number(item.amount))}
                        </text>
                      ) : null}
                      <rect
                        x={x + slot * 0.2}
                        y={170 - height}
                        width={slot * 0.6}
                        height={height}
                        rx="4"
                        className="fill-violet-500"
                      />
                      <text
                        x={x + slot * 0.5}
                        y="191"
                        textAnchor="middle"
                        className="fill-muted-foreground"
                        fontSize={months.length > 6 ? 10 : 13}
                      >
                        {item.month.slice(5)}/{item.month.slice(2, 4)}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  View monthly amounts
                </summary>
                <ul className="mt-3 space-y-3">
                  {months.map((item) => (
                    <li
                      key={item.month}
                      className="flex flex-wrap justify-between gap-2"
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
                      <MoneyText value={item.amount} />
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No dated expenses for this selection.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="min-w-0 border-t-4 border-t-emerald-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags className="size-4 text-emerald-600 dark:text-emerald-400" />
            Top expense tags
          </CardTitle>
          <CardDescription>
            Largest eight tags in the selected period
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.by_category.length ? (
            report.by_category.map((item) => (
              <div key={item.label} className="space-y-1.5">
                <div className="flex flex-wrap justify-between gap-x-2 text-xs">
                  <span className="break-words">{item.label}</span>
                  <MoneyText value={item.amount} />
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  aria-hidden="true"
                >
                  <div
                    className={`h-full rounded-full ${item.label.startsWith("NCE") ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{
                      width: `${(Number(item.amount) / tagMaximum) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No expense tags for this selection.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
