"use client";

import { Callout } from "@/components/shared/callout";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { previewDeletion, executeDeletion, retryDeletionFiles } from "@/actions/data-deletion";
import { deletionPhrase, type DeletionFilters, type DeletionPreview } from "@/lib/deletion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { OptionSelect } from "@/components/shared/option-select";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";

const initial: DeletionFilters = { mode: "receipts", fund: "", custodian: "", from: "", to: "", test: false };
const modes = [
  { value: "receipts", label: "Liquidation receipts only" },
  { value: "photos", label: "Voucher attachments and photos only" },
  { value: "transactions", label: "Transactions and linked files" },
  { value: "reset", label: "Reset all app data" },
];

export function DataDeletionCenter({ funds, custodians }: { funds: { id: string; name: string }[]; custodians: { id: string; name: string }[] }) {
  const router = useRouter();
  const [filters, setFilters] = useState(initial);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"preview" | "delete" | "cleanup" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const reset = filters.mode === "reset";
  const records = reset || filters.mode === "transactions";

  function change(update: Partial<DeletionFilters>) {
    setFilters({ ...filters, ...update });
    setPreview(null); setConfirmation(""); setError(""); setMessage("");
  }
  async function prepare() {
    setBusy("preview"); setError(""); setMessage("");
    try {
      const result = await previewDeletion(filters);
      if (result.ok) { setPreview(result.preview); setConfirmation(""); }
      else setError(result.error);
    } catch { setError("Could not prepare preview. Try again."); }
    finally { setBusy(null); }
  }
  async function remove() {
    if (!preview) return;
    setBusy("delete"); setError("");
    try {
      const result = await executeDeletion(preview.id, confirmation);
      if (result.ok) {
        setMessage(result.message); toast.success("Deletion completed");
        setPreview(null); setConfirmation(""); router.refresh();
      } else setError(result.message);
    } catch { setError("Could not confirm completion. Retry the same preview safely."); }
    finally { setBusy(null); }
  }
  async function cleanup() {
    setBusy("cleanup"); setError("");
    try {
      const result = await retryDeletionFiles();
      if (result.ok) { setMessage(result.message); toast.success("File cleanup checked"); }
      else setError(result.message);
    } catch { setError("Cleanup unavailable. Retry later."); }
    finally { setBusy(null); }
  }

  return <div className="space-y-6">
    <PageHeader title="Data deletion center" description="Choose what to remove, review the affected records, and confirm deletion." />
    <Callout tone="danger" icon={AlertTriangle} title="Danger zone: deleting cannot be undone">Deleted app data cannot be recovered here. User accounts, Google workbook contents, and the audit trail are kept. You will see exactly what will be removed and must type a confirmation phrase before anything is deleted.</Callout>
    {error && !preview ? <Alert variant="destructive"><AlertTitle>Could not complete the request</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {message ? <Alert role="status"><AlertTitle>Update complete</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
    <Card>
      <CardHeader><CardTitle>Choose data to delete</CardTitle><CardDescription>Filters narrow the scope before you review and confirm.</CardDescription></CardHeader>
      <CardContent>
        <fieldset disabled={busy !== null} className="space-y-5">
          <div className="space-y-2"><Label htmlFor="deletion-mode">Delete type</Label><OptionSelect id="deletion-mode" options={modes} value={filters.mode} onValueChange={value => change(value === "reset" ? { ...initial, mode: "reset" } : { mode: value as DeletionFilters["mode"] })} disabled={busy !== null} /></div>
          {reset ? <Alert><AlertTitle>What a full reset removes</AlertTitle><AlertDescription>Transactions, uploaded receipts and photos, funds, categories, notification history, and the Accounting sheet cache. Workbook mappings remain, but fund assignments are cleared and automation is disabled until reassigned. Refresh can import Google history again.</AlertDescription></Alert> : <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2"><Label htmlFor="deletion-fund">Fund</Label><OptionSelect id="deletion-fund" options={[{ value: "", label: "All funds" }, ...funds.map(fund => ({ value: fund.id, label: fund.name }))]} value={filters.fund} onValueChange={fund => change({ fund })} disabled={busy !== null} /></div>
              <div className="min-w-0 space-y-2"><Label htmlFor="deletion-custodian">Assigned custodian</Label><OptionSelect id="deletion-custodian" options={[{ value: "", label: "All custodians" }, ...custodians.map(person => ({ value: person.id, label: person.name }))]} value={filters.custodian} onValueChange={custodian => change({ custodian })} disabled={busy !== null} /></div>
              <div className="space-y-2"><Label htmlFor="deletion-from">Created from (Manila)</Label><Input id="deletion-from" type="date" value={filters.from} onChange={event => change({ from: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="deletion-to">Created through (Manila)</Label><Input id="deletion-to" type="date" value={filters.to} min={filters.from || undefined} onChange={event => change({ to: event.target.value })} /></div>
            </div>
            <Label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring" checked={filters.test} onChange={event => change({ test: event.target.checked })} />Test records only: funds whose name starts with E2E TEST</Label>
            <p className="text-sm text-muted-foreground">Dates use the parent voucher’s creation date. Custodian filters include funds currently assigned to that custodian. Removing transactions recalculates app balances; filters cannot split a replenishment cycle.</p>
          </>}
        </fieldset>
      </CardContent>
      <CardFooter className="justify-end"><Button type="button" disabled={busy !== null} onClick={() => void prepare()}>{busy === "preview" ? <Loader2 className="animate-spin" /> : <Eye />}{busy === "preview" ? "Preparing preview…" : "Preview deletion"}</Button></CardFooter>
    </Card>
    <Card>
      <CardHeader><CardTitle>Pending file cleanup</CardTitle><CardDescription>If file removal was interrupted, retry it without repeating the record deletion.</CardDescription></CardHeader>
      <CardFooter className="justify-end"><Button variant="outline" type="button" disabled={busy !== null} onClick={() => void cleanup()}><RefreshCw className={busy === "cleanup" ? "animate-spin" : undefined} />{busy === "cleanup" ? "Cleaning up…" : "Retry pending file cleanup"}</Button></CardFooter>
    </Card>
    <ResponsiveDialog open={preview !== null} onOpenChange={open => { if (!open && busy !== "delete") { setPreview(null); setConfirmation(""); setError(""); } }} title="Review deletion" description="Review the scope below. This preview expires in 10 minutes.">
      {preview ? <div className="space-y-5">
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted p-4 text-sm">
          {[['Uploaded files', preview.plan.files.length], ...(records ? [['Vouchers', preview.plan.vouchers.length], ['Liquidations', preview.plan.liquidations.length], ['Budget requests', preview.plan.requests.length], ['Replenishments', preview.plan.replenishments.length], ['Funds', preview.plan.funds], ['Categories', preview.plan.categories]] : [])].map(([label, count]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{count}</dd></div>)}
        </dl>
        <p className="text-sm text-muted-foreground">{records ? "Linked lines, revisions, cash settlements, and sync reports will also be removed." : "Financial records stay. Attachment links are cleared and marked as removed by an administrator."}</p>
        <div className="space-y-2"><Label htmlFor="deletion-confirmation">Type {deletionPhrase(filters.mode)}</Label><Input id="deletion-confirmation" autoComplete="off" spellCheck={false} maxLength={30} value={confirmation} disabled={busy !== null} onChange={event => setConfirmation(event.target.value)} /><p className="text-xs text-muted-foreground">The text must match exactly. This action cannot be undone.</p></div>
        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end"><Button variant="outline" disabled={busy !== null} onClick={() => { setPreview(null); setError(""); }}>Cancel</Button><Button variant="destructive" disabled={busy !== null || confirmation !== deletionPhrase(filters.mode)} onClick={() => void remove()}>{busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}{busy === "delete" ? "Deleting…" : `Permanently delete ${reset ? "all app data" : "selected data"}`}</Button></div>
      </div> : null}
    </ResponsiveDialog>
  </div>;
}
