"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveLiquidation } from "@/actions/liquidations";
import { uploadLiquidationReceipt } from "@/lib/liquidation-receipts";
import { parseMoney, formatPHP } from "@/lib/money";
import { saveLiquidationSchema, submitLiquidationSchema, type LiquidationFormValues, type LiquidationLine } from "@/lib/validators/liquidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

export function LiquidationForm({ initial, received, categories }: { initial: LiquidationFormValues; received: string; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const disabled = pending || uploading !== null;
  const spent = form.items.reduce((sum, item) => sum + (parseMoney(item.amount) ?? 0), 0);
  const difference = (parseMoney(received) ?? 0) - spent;
  function updateLine(index: number, patch: Partial<LiquidationLine>) {
    setForm(current => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  }
  async function save(submit: boolean) {
    const parsed = (submit ? submitLiquidationSchema : saveLiquidationSchema).safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the form."); return; }
    setPending(true); setError(null);
    try {
      const result = await saveLiquidation(parsed.data, submit);
      if (!result.ok) { setError(result.error); return; }
      toast.success(submit ? "Liquidation submitted for custodian review" : "Liquidation draft saved");
      setConfirm(false); router.refresh();
    } catch { setError("Could not save liquidation. Try again."); }
    finally { setPending(false); }
  }
  return <form onSubmit={event => { event.preventDefault(); void save(false); }} className="space-y-5 rounded-xl border bg-card p-4 sm:p-6 print:hidden">
    <h2 className="text-lg font-semibold">Actual expenses</h2>
    <p className="text-sm text-muted-foreground">Check the actual figures before submitting. Initial lines come from the voucher. Attach a receipt to each line, or explain why it is missing. Photos and PDFs up to 5 MB are accepted.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="liquidation-department">Department</Label><Input id="liquidation-department" value={form.department} maxLength={100} required disabled={disabled} onChange={e => setForm({ ...form, department: e.target.value })} className="h-11" /></div>
      <div className="space-y-2"><Label htmlFor="liquidation-date">Filing date</Label><Input id="liquidation-date" type="date" value={form.filing_date} required disabled={disabled} onChange={e => setForm({ ...form, filing_date: e.target.value })} className="h-11" /></div>
    </div>
    {form.items.map((item, index) => <fieldset key={item.id} disabled={disabled} className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Expense {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{[{key:'sheet_category',label:'Google Sheets expense tag (optional override)',type:'text'},{key:'company',label:'Company (optional override)',type:'text'},{key:'expense_date',label:'Actual expense date',type:'date'},{key:'supplier',label:'Supplier / payee',type:'text'},{key:'receipt_number',label:'Receipt / invoice number',type:'text'},{key:'plate',label:'Vehicle plate(s), if applicable',type:'text'},{key:'tin',label:'Supplier TIN, if available',type:'text'},{key:'address',label:'Supplier address, if available',type:'text'}].map(field=><div key={field.key} className="space-y-2"><Label htmlFor={`${field.key}-${item.id}`}>{field.label}</Label><Input id={`${field.key}-${item.id}`} type={field.type} maxLength={300} value={item.sheet_details?.[field.key as keyof NonNullable<LiquidationLine['sheet_details']>]??''} onChange={e=>updateLine(index,{sheet_details:{...item.sheet_details,[field.key]:e.target.value}})} /></div>)}</div>
      <div className="space-y-2"><Label htmlFor={`particulars-${item.id}`}>Particulars</Label><Textarea id={`particulars-${item.id}`} value={item.particulars} maxLength={300} onChange={e => updateLine(index, { particulars: e.target.value })} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor={`amount-${item.id}`}>Amount (₱)</Label><Input id={`amount-${item.id}`} inputMode="decimal" value={item.amount} onChange={e => updateLine(index, { amount: e.target.value })} className="h-11" /></div>
        <div className="space-y-2"><Label htmlFor={`category-${item.id}`}>Category</Label><select id={`category-${item.id}`} value={item.category_id} onChange={e => updateLine(index, { category_id: e.target.value })} className="min-h-11 w-full rounded-md border bg-background px-2 text-sm"><option value="">Choose a category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>
      <div className="space-y-2"><Label htmlFor={`receipt-${item.id}`}>{item.receipt_path ? "Replace receipt" : "Receipt attachment"}</Label><Input id={`receipt-${item.id}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="min-h-11" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
        setUploading(item.id); setError(null);
        try { const path = await uploadLiquidationReceipt(file, form.id, item.id); updateLine(index, { receipt_path: path, no_receipt_reason: "" }); toast.success("Receipt uploaded. Save the form to attach it."); }
        catch (problem) { setError(problem instanceof Error ? problem.message : "Receipt upload failed."); }
        finally { setUploading(null); }
      }} /></div>
      {item.receipt_path ? <div className="flex flex-wrap items-center gap-3 text-sm"><span>Receipt attached</span><Button type="button" size="sm" variant="outline" onClick={() => updateLine(index, { receipt_path: "" })}>Remove attachment</Button></div> : <div className="space-y-2"><Label htmlFor={`reason-${item.id}`}>Reason there is no receipt</Label><Textarea id={`reason-${item.id}`} value={item.no_receipt_reason} maxLength={300} onChange={e => updateLine(index, { no_receipt_reason: e.target.value })} /></div>}
      <Button type="button" variant="ghost" className="h-11" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}>Remove expense {index + 1}</Button>
    </fieldset>)}
    <Button type="button" variant="outline" className="h-11" disabled={disabled || form.items.length >= 20} onClick={() => setForm({ ...form, items: [...form.items, { id: crypto.randomUUID(), particulars: "", amount: "", category_id: categories[0]?.id ?? "", receipt_path: "", no_receipt_reason: "" }] })}>Add expense line</Button>
    {form.items.length === 0 ? <div className="space-y-2"><Label htmlFor="unspent-reason">Why was the advance not spent?</Label><Textarea id="unspent-reason" value={form.unspent_reason} maxLength={300} disabled={disabled} onChange={e => setForm({ ...form, unspent_reason: e.target.value })} /></div> : null}
    <div className="grid gap-3 rounded-lg bg-muted p-4 sm:grid-cols-3"><p>Received<br /><strong>{formatPHP(received)}</strong></p><p>Spent<br /><strong>{formatPHP(spent / 100)}</strong></p><p>{difference >= 0 ? "Return due" : "Reimbursement due"}<br /><strong>{formatPHP(Math.abs(difference) / 100)}</strong></p></div>
    <p className="text-xs text-muted-foreground">These totals do not change cash. The custodian records actual settlement after approval.</p>
    {uploading ? <p role="status">Uploading receipt...</p> : null}
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="flex flex-wrap gap-2"><Button type="submit" variant="outline" disabled={disabled} className="h-11">{pending ? "Saving..." : "Save draft"}</Button><Button type="button" disabled={disabled} className="h-11" onClick={() => {
      const parsed = submitLiquidationSchema.safeParse(form);
      if (!parsed.success) setError(parsed.error.issues[0]?.message ?? "Check the form."); else setConfirm(true);
    }}>Submit for review</Button></div>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Submit liquidation?" description="Check the amounts, receipts, and missing-receipt explanations. Editing is locked after submission until a custodian flags it for correction." confirmLabel="Submit for review" pending={pending} onConfirm={() => void save(true)} />
  </form>;
}
