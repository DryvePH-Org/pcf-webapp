"use client";

import { ReceiptAttachment } from "./receipt-attachment";
import { canExtractLiquidationAttachment } from "@/lib/liquidation-attachment";
import { useState } from "react";
import { usePending } from "@/lib/use-single-flight";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  saveCustodianReceipts,
  extractCustodianReceipt,
} from "@/actions/custodian-receipts";
import { uploadLiquidationReceipt } from "@/lib/liquidation-receipts";
import { parseMoney } from "@/lib/money";
import type { CustodianReceipt } from "@/lib/validators/custodian-receipts";
import { NaButton } from "@/components/shared/na-button";
import { SheetApprovalControl } from "@/components/sheets/approval-control";
import { MoneyText } from "@/components/shared/money-text";
import { OptionSelect } from "@/components/shared/option-select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function CustodianReceiptReview({
  id,
  revision,
  initial,
  tags,
  total,
  advance,
  filingDate,
  urls,
  aiReady,
  reviewSaved,
  companies = [],
}: {
  id: string;
  revision: number;
  initial: CustodianReceipt[];
  tags: string[];
  total: number;
  advance?: number;
  filingDate: string;
  urls: Record<string, string>;
  aiReady: boolean;
  reviewSaved: boolean;
  // Companies an expense can be charged to; empty when the sheet has no COMPANY column.
  companies?: readonly string[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initial);
  const [customTags, setCustomTags] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [busy, setBusy, isBusy] = usePending();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const sum = lines.reduce(
    (amount, line) => amount + (parseMoney(line.amount) ?? 0),
    0,
  );
  function update(index: number, patch: Partial<CustodianReceipt>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
    setDirty(true);
    setNotice("");
  }
  async function extract(index: number, path: string) {
    if (isBusy()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await extractCustodianReceipt(id, path);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setExtractionWarnings(result.warnings);
      const populated = Object.fromEntries(
        Object.entries(result.suggestion).filter(([, value]) => value !== ""),
      );
      update(index, { ...populated, physical_checked: false });
      setNotice(
        "AI suggestions filled available fields. Check every value against the physical receipt and edit any errors.",
      );
    } catch {
      setError(
        "Extraction interrupted. Enter the receipt details manually or try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (isBusy()) return;
    setBusy(true);
    setError("");
    try {
      const result = await saveCustodianReceipts({ id, revision, lines });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        sum === Math.round(total * 100)
          ? "Receipt review saved. Prepare the Google Sheets preview next."
          : "Review saved. Reconcile the reviewed total with the reported spending before approval.",
      );
      setDirty(false);
      router.refresh();
    } catch {
      setError(
        "Could not save the receipt review. Refresh before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card id="receipt-review" className="scroll-mt-24 print:hidden">
      <CardHeader>
        <CardTitle>Custodian receipt review</CardTitle>
        <CardDescription>
          Match the requester’s total and review each expense, including
          expenses without receipts.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-5">
        <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">
              Cash received by employee
            </p>
            <MoneyText
              className="text-lg font-semibold"
              value={advance ?? total}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Actual spending reported
            </p>
            <MoneyText className="text-lg font-semibold" value={total} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {(advance ?? total) >= total
                ? "Employee returns"
                : "Employee reimbursement due"}
            </p>
            <MoneyText
              className="text-lg font-semibold"
              value={Math.abs((advance ?? total) - total)}
            />
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <Alert role="status">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        {extractionWarnings.length ? (
          <Alert>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                {extractionWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        {!aiReady ? (
          <p className="text-sm text-muted-foreground">
            Automatic extraction is unavailable. Enter receipt details manually.
          </p>
        ) : null}
        {!tags.length ? (
          <Alert>
            <AlertDescription>
              No workbook tags are available. You can enter a tag now.
              Accounting can check your workbook assignment for Sheets delivery.
            </AlertDescription>
          </Alert>
        ) : null}
        <fieldset disabled={busy} className="min-w-0 space-y-5">
          {lines.map((line, index) => (
            <div key={line.id} className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-medium">Receipt entry {index + 1}</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLines(lines.filter((_, i) => i !== index));
                    setDirty(true);
                  }}
                >
                  <Trash2 />
                  Remove
                </Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    !aiReady ||
                    !canExtractLiquidationAttachment(line.receipt_path)
                  }
                  onClick={() => void extract(index, line.receipt_path)}
                >
                  <Sparkles />
                  Extract and autofill
                </Button>
                {line.receipt_path &&
                  !canExtractLiquidationAttachment(line.receipt_path) && (
                    <p className="self-center text-xs text-muted-foreground">
                      Enter details manually for PDF, HEIC, and HEIF
                      attachments.
                    </p>
                  )}
              </div>
              <ReceiptAttachment
                id={`physical-upload-${line.id}`}
                attached={Boolean(line.receipt_path)}
                uploading={uploading === line.id}
                url={urls[line.receipt_path]}
                onRemove={() =>
                  update(index, { receipt_path: "", physical_checked: false })
                }
                onChoose={async (file) => {
                  if (isBusy()) return;
    setBusy(true);
                  setUploading(line.id);
                  setError("");
                  try {
                    const path = await uploadLiquidationReceipt(
                      file,
                      id,
                      line.id,
                    );
                    update(index, {
                      receipt_path: path,
                      physical_checked: false,
                    });
                    if (aiReady && canExtractLiquidationAttachment(path))
                      await extract(index, path);
                  } catch (problem) {
                    setError(
                      problem instanceof Error
                        ? problem.message
                        : "Receipt upload failed.",
                    );
                  } finally {
                    setUploading(null);
                    setBusy(false);
                  }
                }}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["particulars", "Particulars", "text"],
                    ["amount", "Receipt amount (₱)", "text"],
                    ["supplier", "Supplier", "text"],
                    ["tin", "Supplier TIN or NON VAT", "text"],
                    ["expense_date", "Transaction / liquidation date", "date"],
                    ["plate", "Plate number for verification", "text"],
                    [
                      "receipt_number",
                      "Receipt / invoice number (optional)",
                      "text",
                    ],
                  ] as const
                ).map(([key, label, type]) => (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`${key}-${line.id}`}>{label}</Label>
                      {key === "supplier" ||
                      key === "tin" ||
                      key === "plate" ||
                      key === "receipt_number" ? (
                        <NaButton
                          value={line[key]}
                          onChange={(next) => update(index, { [key]: next })}
                        />
                      ) : null}
                    </div>
                    <Input
                      id={`${key}-${line.id}`}
                      type={type}
                      inputMode={key === "amount" ? "decimal" : undefined}
                      maxLength={
                        key === "tin" || key === "receipt_number" ? 100 : 300
                      }
                      value={line[key]}
                      onChange={(event) =>
                        update(index, { [key]: event.target.value })
                      }
                    />
                  </div>
                ))}
                {companies.length > 0 ? (
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={`company-${line.id}`}>Company charged</Label>
                    <OptionSelect
                      id={`company-${line.id}`}
                      value={line.company}
                      onValueChange={(company) => update(index, { company })}
                      options={companies.map((company) => ({ value: company, label: company }))}
                    />
                  </div>
                ) : null}
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`tag-${line.id}`}>{companies.length > 0 ? "Expense type" : "Workbook tag"}</Label>
                  {(customTags[line.id] ??
                  (!tags.length ||
                    Boolean(line.tag && !tags.includes(line.tag)))) ? (
                    <Input
                      id={`tag-${line.id}`}
                      maxLength={150}
                      value={line.tag}
                      placeholder="Enter a tag"
                      onChange={(event) =>
                        update(index, { tag: event.target.value })
                      }
                    />
                  ) : (
                    <OptionSelect
                      id={`tag-${line.id}`}
                      value={line.tag}
                      onValueChange={(tag) => update(index, { tag })}
                      options={[
                        { value: "", label: "Choose a workbook tag" },
                        ...tags.map((tag) => ({ value: tag, label: tag })),
                      ]}
                    />
                  )}
                  {tags.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const custom =
                          customTags[line.id] ??
                          Boolean(line.tag && !tags.includes(line.tag));
                        setCustomTags({ ...customTags, [line.id]: !custom });
                        if (custom && !tags.includes(line.tag))
                          update(index, { tag: "" });
                      }}
                    >
                      {(customTags[line.id] ??
                      Boolean(line.tag && !tags.includes(line.tag)))
                        ? "Choose existing tag"
                        : "Enter a custom tag"}
                    </Button>
                  )}
                </div>
              </div>
              <Label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={line.physical_checked}
                  onChange={(event) =>
                    update(index, { physical_checked: event.target.checked })
                  }
                />
                {line.receipt_path
                  ? "I verified the receipt and expense details."
                  : "I reviewed this expense without an attached receipt."}
              </Label>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={lines.length >= 40}
            onClick={() => {
              setLines([
                ...lines,
                {
                  id: crypto.randomUUID(),
                  particulars: "",
                  amount: "",
                  supplier: "",
                  tin: "",
                  tag: "",
                  expense_date: filingDate,
                  plate: "",
                  receipt_number: "",
                  company: companies[0] ?? "",
                  receipt_path: "",
                  physical_checked: false,
                },
              ]);
              setDirty(true);
            }}
          >
            <Plus />
            Add receipt entry
          </Button>
        </fieldset>
        <div className="space-y-2 text-sm">
          <p>
            Reviewed expense total <MoneyText value={sum / 100} />
          </p>
          {sum !== Math.round(total * 100) && (
            <p role="status" className="text-destructive">
              You can save this review. Reconcile{" "}
              <MoneyText value={Math.abs(sum / 100 - total)} /> with the
              requester’s actual spending before approval.
            </p>
          )}
        </div>
        {dirty ? (
          <p role="status" className="text-sm text-muted-foreground">
            Unsaved receipt changes. Save them before preparing the approval
            preview.
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-3">
        {reviewSaved && !dirty ? <SheetApprovalControl id={id} /> : null}
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? "Working…" : "Save receipt review"}
        </Button>
      </CardFooter>
    </Card>
  );
}
