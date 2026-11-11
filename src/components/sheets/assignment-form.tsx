"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SheetsRefresh } from "@/components/sheets/refresh-control";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { configureWorkbook } from "@/actions/sheets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OptionSelect } from "@/components/shared/option-select";
import type { Workbook, SheetTab } from "@/lib/sheets/types";

export function WorkbookAssignment({
  book,
  custodians,
  funds,
  assignments,
}: {
  book: Workbook;
  custodians: { id: string; full_name: string }[];
  funds: { id: string; name: string }[];
  assignments: { fund_id: string; custodian_id: string }[];
}) {
  const router = useRouter();
  const [custodian, setCustodian] = useState(book.custodian_id ?? "");
  const [fund, setFund] = useState(book.fund_id ?? "");
  const [sheet, setSheet] = useState(
    book.active_sheet_id === null ? "" : String(book.active_sheet_id),
  );
  const [enabled, setEnabled] = useState(book.enabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const eligibleFunds = funds.filter((item) =>
    assignments.some(
      (link) => link.custodian_id === custodian && link.fund_id === item.id,
    ),
  );
  const tabs = book.catalog as unknown as SheetTab[];
  const ready = Boolean(
    custodian &&
      eligibleFunds.some((item) => item.id === fund) &&
      tabs.some((tab) => String(tab.sheetId) === sheet),
  );
  const prefix = `workbook-${book.id}`;
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        try {
          const result = await configureWorkbook({
            id: book.id as "operations",
            custodian: custodian || null,
            fund: fund || null,
            sheet: sheet === "" ? null : Number(sheet),
            enabled,
          });
          if (result.ok) {
            toast.success("Assignment saved");
            router.refresh();
          } else setError(result.error ?? "Could not save assignment.");
        } catch {
          setError("Could not save assignment.");
        } finally {
          setPending(false);
        }
      }}
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{book.name}</CardTitle>
            <Badge variant={book.enabled ? "secondary" : "outline"}>
              {book.enabled ? "Sync enabled" : "Sync off"}
            </Badge>
          </div>
          <CardDescription>
            <a
              className="underline underline-offset-4"
              href={`https://docs.google.com/spreadsheets/d/${book.spreadsheet_id}/edit${sheet ? `#gid=${sheet}` : ""}`}
              target="_blank"
              rel="noreferrer"
            >
              Open in Google Sheets
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`${prefix}-custodian`}>Custodian</Label>
              <OptionSelect
                id={`${prefix}-custodian`}
                value={custodian}
                onValueChange={(value) => {
                  setCustodian(value);
                  if (
                    !assignments.some(
                      (link) =>
                        link.custodian_id === value && link.fund_id === fund,
                    )
                  ) {
                    setFund("");
                    setEnabled(false);
                  }
                }}
                disabled={pending}
                options={[
                  { value: "", label: "Unassigned" },
                  ...custodians.map((person) => ({
                    value: person.id,
                    label: person.full_name,
                  })),
                ]}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`${prefix}-fund`}>Fund</Label>
              <OptionSelect
                id={`${prefix}-fund`}
                value={fund}
                onValueChange={(value) => {
                  setFund(value);
                  if (!value) setEnabled(false);
                }}
                disabled={pending || !eligibleFunds.length}
                options={[
                  {
                    value: "",
                    label: custodian
                      ? "Choose assigned fund"
                      : "Choose a custodian first",
                  },
                  ...eligibleFunds.map((item) => ({
                    value: item.id,
                    label: item.name,
                  })),
                ]}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`${prefix}-sheet`}>Active worksheet</Label>
              <OptionSelect
                id={`${prefix}-sheet`}
                value={sheet}
                onValueChange={(value) => {
                  setSheet(value);
                  if (!value) setEnabled(false);
                }}
                disabled={pending || !tabs.length}
                options={[
                  {
                    value: "",
                    label: tabs.length
                      ? "Choose destination worksheet"
                      : "Refresh to load worksheets",
                  },
                  ...tabs.map((tab) => ({
                    value: String(tab.sheetId),
                    label: tab.title,
                  })),
                ]}
              />
            </div>
          </div>
          <Label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring"
              checked={enabled}
              disabled={pending || (!enabled && !ready)}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enable liquidation synchronization
          </Label>
          {custodian && !eligibleFunds.length && (
            <p className="text-sm text-muted-foreground">
              This custodian has no active funds. Assign one under{" "}
              <a className="underline" href="/funds">
                Fund assignments
              </a>
              .
            </p>
          )}
          {book.sync_error && (
            <Alert variant="destructive">
              <AlertDescription>{book.sync_error}</AlertDescription>
            </Alert>
          )}
          <SheetsRefresh book={book.id} automatic={false} />
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending || (enabled && !ready)}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            {pending ? "Saving…" : "Save assignment"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
