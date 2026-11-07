"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { configureWorkbook } from "@/actions/sheets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { OptionSelect } from "@/components/shared/option-select";
import type { Workbook, SheetTab } from "@/lib/sheets/types";

export function WorkbookAssignment({ book, custodians, funds }: { book: Workbook; custodians: { id: string; full_name: string }[]; funds: { id: string; name: string }[] }) {
  const router = useRouter();
  const [custodian, setCustodian] = useState(book.custodian_id ?? "");
  const [fund, setFund] = useState(book.fund_id ?? "");
  const [sheet, setSheet] = useState(book.active_sheet_id === null ? "" : String(book.active_sheet_id));
  const [enabled, setEnabled] = useState(book.enabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const prefix = `workbook-${book.id}`;
  return <form onSubmit={async event => {
    event.preventDefault(); setPending(true); setError("");
    try {
      const result = await configureWorkbook({ id: book.id as "operations", custodian: custodian || null, fund: fund || null, sheet: sheet === "" ? null : Number(sheet), enabled });
      if (result.ok) { toast.success("Assignment saved"); router.refresh(); }
      else setError(result.error ?? "Could not save assignment.");
    } catch { setError("Could not save assignment."); }
    finally { setPending(false); }
  }}>
    <Card>
      <CardHeader><CardTitle>{book.name}</CardTitle><CardDescription>Assign a custodian, fund, and active worksheet for this destination.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-2"><Label htmlFor={`${prefix}-custodian`}>Custodian</Label><OptionSelect id={`${prefix}-custodian`} value={custodian} onValueChange={setCustodian} disabled={pending} options={[{ value: "", label: "Unassigned" }, ...custodians.map(person => ({ value: person.id, label: person.full_name }))]} /></div>
          <div className="min-w-0 space-y-2"><Label htmlFor={`${prefix}-fund`}>Fund</Label><OptionSelect id={`${prefix}-fund`} value={fund} onValueChange={setFund} disabled={pending} options={[{ value: "", label: "Unassigned" }, ...funds.map(item => ({ value: item.id, label: item.name }))]} /></div>
          <div className="min-w-0 space-y-2"><Label htmlFor={`${prefix}-sheet`}>Active worksheet</Label><OptionSelect id={`${prefix}-sheet`} value={sheet} onValueChange={setSheet} disabled={pending} options={[{ value: "", label: "Choose after refresh" }, ...(book.catalog as unknown as SheetTab[]).map(tab => ({ value: String(tab.sheetId), label: tab.title }))]} /></div>
        </div>
        <Label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring" checked={enabled} disabled={pending} onChange={event => setEnabled(event.target.checked)} />Enable liquidation synchronization</Label>
        <p className="text-sm text-muted-foreground">Assign the custodian to the selected fund first. Queued updates keep their original destination.</p>
      </CardContent>
      <CardFooter className="justify-end"><Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />}{pending ? "Saving…" : "Save assignment"}</Button></CardFooter>
    </Card>
  </form>;
}
