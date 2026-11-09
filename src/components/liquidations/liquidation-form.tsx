"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Paperclip, Plus, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { saveLiquidation } from "@/actions/liquidations";
import { Callout } from "@/components/shared/callout";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MoneyText } from "@/components/shared/money-text";
import { OptionSelect } from "@/components/shared/option-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadLiquidationReceipt } from "@/lib/liquidation-receipts";
import { parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  saveLiquidationSchema,
  submitLiquidationSchema,
  type LiquidationFormValues,
  type LiquidationLine,
} from "@/lib/validators/liquidation";

type SheetDetails = NonNullable<LiquidationLine["sheet_details"]>;

// Optional extras for the accounting sheet. Kept out of the way: the four
// things people must fill in per expense come first.
const SHEET_FIELDS: { key: keyof SheetDetails; label: string; type?: string; hint?: string }[] = [
  { key: "supplier", label: "Supplier / payee" },
  { key: "receipt_number", label: "Receipt or invoice number" },
  { key: "plate", label: "Vehicle plate(s)", hint: "If this is a vehicle expense" },
  { key: "tin", label: "Supplier TIN" },
  { key: "address", label: "Supplier address" },
  { key: "company", label: "Company", hint: "Leave blank to use the default" },
  { key: "sheet_category", label: "Sheet expense tag", hint: "Leave blank to use the default" },
];

function Required() {
  return <span className="text-destructive" aria-hidden>*</span>;
}

type Problems = Partial<Record<"date" | "particulars" | "amount" | "category" | "receipt", string>>;

// Mirrors what "Submit for review" insists on, so each gap is shown on the
// expense it belongs to instead of as one message at the bottom.
function problemsFor(item: LiquidationLine): Problems {
  const found: Problems = {};
  if (!item.sheet_details?.expense_date) found.date = "Enter the date you actually spent it.";
  if (!item.particulars.trim()) found.particulars = "Describe what was bought.";
  const cents = parseMoney(item.amount);
  if (cents === null || cents <= 0) found.amount = "Enter an amount above zero (for example 250.00).";
  if (!item.category_id) found.category = "Choose a category.";
  if (!item.receipt_path && !item.no_receipt_reason.trim()) found.receipt = "Attach the receipt, or explain why there is none.";
  return found;
}

export function LiquidationForm({
  initial,
  received,
  categories,
}: {
  initial: LiquidationFormValues;
  received: string;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [checked, setChecked] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const disabled = pending || uploading !== null;

  const spent = form.items.reduce((sum, item) => sum + (parseMoney(item.amount) ?? 0), 0);
  const difference = (parseMoney(received) ?? 0) - spent;
  const allProblems = form.items.map(problemsFor);
  const problemCount = allProblems.reduce((sum, p) => sum + Object.keys(p).length, 0);

  function updateLine(index: number, patch: Partial<LiquidationLine>) {
    setForm(current => ({
      ...current,
      items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function updateSheet(index: number, key: keyof SheetDetails, value: string) {
    updateLine(index, { sheet_details: { ...form.items[index].sheet_details, [key]: value } });
  }

  async function save(submit: boolean) {
    const parsed = (submit ? submitLiquidationSchema : saveLiquidationSchema).safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await saveLiquidation(parsed.data, submit);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(submit ? "Submitted. The custodian will review it." : "Draft saved");
      setConfirm(false);
      router.refresh();
    } catch {
      setError("Could not save the liquidation. Try again.");
    } finally {
      setPending(false);
    }
  }

  function trySubmit() {
    setChecked(true);
    setError(null);
    if (!form.department.trim()) {
      setError("Enter the department.");
      document.getElementById("liquidation-department")?.focus();
      return;
    }
    if (form.items.length === 0 && !form.unspent_reason.trim()) {
      setError("Explain why the advance was not spent.");
      document.getElementById("unspent-reason")?.focus();
      return;
    }
    const firstBad = allProblems.findIndex(p => Object.keys(p).length > 0);
    if (firstBad >= 0) {
      setError(`Expense ${firstBad + 1} is missing something. The gaps are marked in red.`);
      document.getElementById(`expense-${form.items[firstBad].id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const parsed = submitLiquidationSchema.safeParse(form);
    if (!parsed.success) setError(parsed.error.issues[0]?.message ?? "Check the form.");
    else setConfirm(true);
  }

  async function attach(index: number, id: string, file: File | undefined) {
    if (!file) return;
    setUploading(id);
    setError(null);
    try {
      const path = await uploadLiquidationReceipt(file, form.id, id);
      updateLine(index, { receipt_path: path, no_receipt_reason: "" });
      toast.success("Receipt uploaded. Save the form to keep it.");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Receipt upload failed.");
    } finally {
      setUploading(null);
    }
  }

  const resultLabel = difference > 0 ? "Return to the fund" : difference < 0 ? "Fund owes you" : "Balanced";
  const resultTone = difference > 0 ? "text-amber-800" : difference < 0 ? "text-sky-800" : "text-emerald-800";

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        void save(false);
      }}
      className="space-y-5 print:hidden"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Your actual expenses</h2>
        <p className="text-sm text-muted-foreground">
          List what you really spent. Each expense needs a date, a description, an amount, a category, and a receipt (or the reason there is none). Photos and PDFs up to 5 MB.
        </p>
      </div>

      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <div className="space-y-2">
          <Label htmlFor="liquidation-department">Department <Required /></Label>
          <Input id="liquidation-department" value={form.department} maxLength={100} required disabled={disabled} onChange={e => setForm({ ...form, department: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="liquidation-date">Filing date <Required /></Label>
          <Input id="liquidation-date" type="date" value={form.filing_date} required disabled={disabled} onChange={e => setForm({ ...form, filing_date: e.target.value })} />
        </div>
      </div>

      {form.items.map((item, index) => {
        const p = checked ? allProblems[index] : {};
        const bad = Object.keys(p).length > 0;
        const sheet = item.sheet_details ?? {};
        return (
          <fieldset
            key={item.id}
            id={`expense-${item.id}`}
            disabled={disabled}
            className={cn("space-y-4 rounded-xl border bg-card p-4 sm:p-5", bad && "border-destructive/60 ring-2 ring-destructive/15")}
          >
            <legend className="sr-only">Expense {index + 1}</legend>
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">{index + 1}</span>
                Expense {index + 1}
              </h3>
              <MoneyText value={(parseMoney(item.amount) ?? 0) / 100} className="text-base font-semibold" />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`particulars-${item.id}`}>What was it for? <Required /></Label>
              <Textarea id={`particulars-${item.id}`} value={item.particulars} maxLength={300} rows={2} aria-invalid={Boolean(p.particulars)} onChange={e => updateLine(index, { particulars: e.target.value })} />
              {p.particulars ? <FieldError>{p.particulars}</FieldError> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={`expense_date-${item.id}`}>Date spent <Required /></Label>
                <Input id={`expense_date-${item.id}`} type="date" value={sheet.expense_date ?? ""} aria-invalid={Boolean(p.date)} onChange={e => updateSheet(index, "expense_date", e.target.value)} />
                {p.date ? <FieldError>{p.date}</FieldError> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`amount-${item.id}`}>Amount <Required /></Label>
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">₱</span>
                  <Input id={`amount-${item.id}`} inputMode="decimal" maxLength={13} placeholder="0.00" value={item.amount} aria-invalid={Boolean(p.amount)} className="pl-7 text-right font-semibold tabular-nums" onChange={e => updateLine(index, { amount: e.target.value })} />
                </div>
                {p.amount ? <FieldError>{p.amount}</FieldError> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`category-${item.id}`}>Category <Required /></Label>
                <OptionSelect id={`category-${item.id}`} value={item.category_id} disabled={disabled} onValueChange={category_id => updateLine(index, { category_id })} options={[{ value: "", label: "Choose a category" }, ...categories.map(category => ({ value: category.id, label: category.name }))]} />
                {p.category ? <FieldError>{p.category}</FieldError> : null}
              </div>
            </div>

            <div className={cn("space-y-3 rounded-lg border border-dashed p-3 sm:p-4", p.receipt && "border-destructive/60 bg-destructive/5")}>
              <p className="text-sm font-semibold">Receipt <Required /></p>
              <input
                id={`receipt-${item.id}`}
                ref={node => { fileInputs.current[item.id] = node; }}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                tabIndex={-1}
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void attach(index, item.id, file);
                }}
              />
              {item.receipt_path ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><Paperclip className="size-4" aria-hidden />Receipt attached</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => fileInputs.current[item.id]?.click()}>Replace</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => updateLine(index, { receipt_path: "" })}>Remove</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button type="button" variant="outline" onClick={() => fileInputs.current[item.id]?.click()}>
                    <Paperclip />
                    {uploading === item.id ? "Uploading..." : "Attach photo or PDF"}
                  </Button>
                  <div className="space-y-2">
                    <Label htmlFor={`reason-${item.id}`} className="text-[13px] font-medium text-muted-foreground">No receipt? Say why</Label>
                    <Textarea id={`reason-${item.id}`} rows={2} value={item.no_receipt_reason} maxLength={300} placeholder="Example: the stall does not issue official receipts" onChange={e => updateLine(index, { no_receipt_reason: e.target.value })} />
                  </div>
                </div>
              )}
              {p.receipt ? <FieldError>{p.receipt}</FieldError> : null}
            </div>

            <details className="group rounded-lg bg-muted/50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium select-none">
                Accounting details <span className="font-normal text-muted-foreground">(optional: supplier, receipt number, plate...)</span>
              </summary>
              <div className="mt-3 grid gap-3 pb-1 sm:grid-cols-2">
                {SHEET_FIELDS.map(field => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`${field.key}-${item.id}`}>{field.label}</Label>
                    <Input id={`${field.key}-${item.id}`} maxLength={300} value={sheet[field.key] ?? ""} onChange={e => updateSheet(index, field.key, e.target.value)} />
                    {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
                  </div>
                ))}
              </div>
            </details>

            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}>
                <Trash2 />
                Remove expense {index + 1}
              </Button>
            </div>
          </fieldset>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full border-dashed sm:w-auto"
        disabled={disabled || form.items.length >= 20}
        onClick={() => setForm({ ...form, items: [...form.items, { id: crypto.randomUUID(), particulars: "", amount: "", category_id: "", receipt_path: "", no_receipt_reason: "" }] })}
      >
        <Plus />
        Add another expense
      </Button>

      {form.items.length === 0 ? (
        <div className="space-y-2 rounded-xl border bg-card p-4 sm:p-5">
          <Label htmlFor="unspent-reason">Why was the advance not spent? <Required /></Label>
          <Textarea id="unspent-reason" value={form.unspent_reason} maxLength={300} disabled={disabled} onChange={e => setForm({ ...form, unspent_reason: e.target.value })} />
        </div>
      ) : null}

      {uploading ? <p role="status" className="text-sm font-medium">Uploading receipt...</p> : null}
      {checked && problemCount > 0 ? (
        <Callout tone="warning" title={`${problemCount} ${problemCount === 1 ? "thing needs" : "things need"} attention before you can submit`}>
          They are marked in red on the expenses above.
        </Callout>
      ) : null}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur sm:p-4 lg:bottom-4">
        {error ? (
          <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Received</dt><dd className="font-semibold"><MoneyText value={received} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Spent</dt><dd className="font-semibold"><MoneyText value={spent / 100} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">{resultLabel}</dt><dd className={cn("font-semibold", resultTone)}>{difference === 0 ? "₱0.00" : <MoneyText value={Math.abs(difference) / 100} />}</dd></div>
          </dl>
          <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none [&>button:last-child]:flex-[2] sm:[&>button:last-child]:flex-none">
            <Button type="submit" variant="outline" size="lg" disabled={disabled}>
              <Save />
              {pending ? "Saving..." : "Save draft"}
            </Button>
            <Button type="button" size="lg" disabled={disabled} onClick={trySubmit}>
              <Send />
              Submit for review
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">These totals do not move cash. The custodian records the actual settlement after approval.</p>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Submit liquidation for review?"
        description="Check the amounts, receipts, and missing-receipt explanations. You cannot edit it again unless the custodian flags it for correction."
        confirmLabel="Submit for review"
        pending={pending}
        onConfirm={() => void save(true)}
      />
    </form>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="flex items-center gap-1.5 text-sm font-medium text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden />{children}</p>;
}
