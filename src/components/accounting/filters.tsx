"use client";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/shared/option-select";
import type { AccountingFilters } from "@/lib/accounting";
import type { SheetTab } from "@/lib/sheets/types";
export function AccountingFilterForm({
  filters,
  books,
  custodians,
  categories,
  companies,
}: {
  filters: AccountingFilters;
  books: { id: string; name: string; catalog: SheetTab[] }[];
  custodians: { id: string; name: string }[];
  categories: string[];
  companies: string[];
}) {
  const [period, setPeriod] = useState(filters.period),
    [month, setMonth] = useState(filters.month),
    [from, setFrom] = useState(filters.from),
    [to, setTo] = useState(filters.to),
    [book, setBook] = useState(filters.book),
    [tab, setTab] = useState(filters.tab);
  const selected = books.find((item) => item.id === book);
  const advancedCount = [
    filters.custodian,
    filters.person,
    filters.supplier,
    filters.plate,
    filters.tin,
    filters.category,
    filters.company,
    filters.classification,
    filters.receipt,
    filters.date_status,
    filters.repeats,
    filters.tab,
  ].filter(Boolean).length;
  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>Find expenses</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="accounting-q">Search expenses</Label>
              <Input
                id="accounting-q"
                name="q"
                maxLength={150}
                defaultValue={filters.q}
                placeholder="Search voucher, receipt, supplier or particulars…"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="accounting-book">Workbook</Label>
              <OptionSelect
                id="accounting-book"
                name="book"
                value={book}
                onValueChange={(value) => {
                  setBook(value);
                  setTab("");
                }}
                options={[
                  { value: "", label: "All workbooks" },
                  ...books.map((item) => ({
                    value: item.id,
                    label: item.name,
                  })),
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accounting-period">Period</Label>
              <OptionSelect
                id="accounting-period"
                name="period"
                value={period}
                onValueChange={setPeriod}
                options={[
                  { value: "latest", label: "Latest available month" },
                  { value: "current", label: "Current month" },
                  { value: "month", label: "Selected month" },
                  { value: "custom", label: "Date range" },
                  { value: "all", label: "All history" },
                ]}
              />
            </div>
            {period === "month" ? (
              <div className="space-y-2">
                <Label htmlFor="accounting-month">Month</Label>
                <Input
                  id="accounting-month"
                  name="month"
                  type="month"
                  value={month}
                  onChange={(event) => {
                    setMonth(event.target.value);
                    setPeriod("month");
                  }}
                />
              </div>
            ) : null}
            {period === "custom" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="accounting-from">From</Label>
                  <Input
                    id="accounting-from"
                    name="from"
                    type="date"
                    value={from}
                    onChange={(event) => {
                      setFrom(event.target.value);
                      setPeriod("custom");
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accounting-to">Through</Label>
                  <Input
                    id="accounting-to"
                    name="to"
                    type="date"
                    value={to}
                    onChange={(event) => {
                      setTo(event.target.value);
                      setPeriod("custom");
                    }}
                  />
                </div>
              </>
            ) : null}
          </div>
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">
              More filters
              {advancedCount > 0 ? ` · ${advancedCount} active` : ""}
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="accounting-custodian">Custodian</Label>
                <OptionSelect
                  id="accounting-custodian"
                  name="custodian"
                  defaultValue={filters.custodian}
                  options={[
                    { value: "", label: "All custodians" },
                    { value: "unassigned", label: "Unassigned workbooks" },
                    ...custodians.map((item) => ({
                      value: item.id,
                      label: item.name,
                    })),
                  ]}
                />
              </div>

              <div className="min-w-0 space-y-2">
                <Label htmlFor="accounting-tab">Worksheet</Label>
                <OptionSelect
                  id="accounting-tab"
                  name="tab"
                  value={tab}
                  onValueChange={setTab}
                  disabled={!book}
                  options={[
                    {
                      value: "",
                      label: book
                        ? "All worksheets"
                        : "Choose a workbook first",
                    },
                    ...(selected?.catalog ?? []).map((item) => ({
                      value: String(item.sheetId),
                      label: item.title,
                    })),
                  ]}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="accounting-category">Expense tag</Label>
                <OptionSelect
                  id="accounting-category"
                  name="category"
                  defaultValue={filters.category}
                  options={[
                    { value: "", label: "All tags" },
                    ...categories.map((value) => ({ value, label: value })),
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accounting-classification">
                  Classification
                </Label>
                <OptionSelect
                  id="accounting-classification"
                  name="classification"
                  defaultValue={filters.classification}
                  options={[
                    { value: "", label: "All classifications" },
                    { value: "CE", label: "CE" },
                    { value: "NCE", label: "NCE" },
                    { value: "other", label: "Other / unclassified" },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accounting-company">Company</Label>
                <OptionSelect
                  id="accounting-company"
                  name="company"
                  defaultValue={filters.company}
                  options={[
                    { value: "", label: "All companies" },
                    ...companies.map((value) => ({ value, label: value })),
                  ]}
                />
              </div>
              {(["person", "supplier", "plate", "tin"] as const).map(
                (field) => (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={`accounting-${field}`}>
                      {field === "person"
                        ? "Point person"
                        : field === "tin"
                          ? "Supplier TIN"
                          : field === "plate"
                            ? "Plate number"
                            : "Supplier"}
                    </Label>
                    <Input
                      id={`accounting-${field}`}
                      name={field}
                      maxLength={300}
                      defaultValue={filters[field]}
                      placeholder="Contains…"
                    />
                  </div>
                ),
              )}
              <div className="space-y-2">
                <Label htmlFor="accounting-receipt">Receipt number</Label>
                <OptionSelect
                  id="accounting-receipt"
                  name="receipt"
                  defaultValue={filters.receipt}
                  options={[
                    { value: "", label: "Any receipt number" },
                    { value: "present", label: "Number recorded" },
                    { value: "missing", label: "Number missing" },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accounting-date-status">
                  Date completeness
                </Label>
                <OptionSelect
                  id="accounting-date-status"
                  name="date_status"
                  defaultValue={filters.date_status}
                  onValueChange={(value) => {
                    if (value === "missing") {
                      setPeriod("all");
                      setFrom("");
                      setTo("");
                    }
                  }}
                  options={[
                    { value: "", label: "Any date status" },
                    { value: "missing", label: "Missing dates only" },
                  ]}
                />
              </div>
              <Label className="flex min-h-11 items-center gap-3 sm:col-span-2">
                <input
                  className="size-4 accent-primary"
                  type="checkbox"
                  name="repeats"
                  value="1"
                  defaultChecked={filters.repeats}
                />
                Include exact copies from other worksheets
              </Label>
            </div>
          </details>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/accounting" />}
            >
              Reset filters
            </Button>
            <Button type="submit">
              <Search />
              Apply filters
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
