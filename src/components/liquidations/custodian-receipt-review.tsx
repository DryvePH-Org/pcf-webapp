"use client";

import { useState } from "react";
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
  filingDate,
  urls,
  aiReady,
  reviewSaved,
}: {
  id: string;
  revision: number;
  initial: CustodianReceipt[];
  tags: string[];
  total: number;
  filingDate: string;
  urls: Record<string, string>;
  aiReady: boolean;
  reviewSaved: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await extractCustodianReceipt(id, path);
      if (!result.ok) {
        setError(result.error);
        return;
      }
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
    setBusy(true);
    setError("");
    try {
      const result = await saveCustodianReceipts({ id, revision, lines });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        "Receipt review saved. Prepare the Google Sheets preview next.",
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
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>Custodian receipt review</CardTitle>
        <CardDescription>
          Reconcile these entries to the requester’s total and verify every
          physical receipt. Tags come from your assigned workbook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
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
        {!aiReady ? (
          <p className="text-sm text-muted-foreground">
            Automatic extraction is unavailable. Enter receipt details manually.
          </p>
        ) : null}
        {!tags.length ? (
          <Alert>
            <AlertDescription>
              No workbook tags are available. Ask Admin to assign your workbook
              and refresh its data before encoding.
            </AlertDescription>
          </Alert>
        ) : null}
        <fieldset disabled={busy} className="space-y-5">
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
                {urls[line.receipt_path] ? (
                  <a
                    className="text-sm underline underline-offset-4"
                    href={urls[line.receipt_path]}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View requester / saved receipt
                  </a>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!aiReady || !line.receipt_path}
                  onClick={() => void extract(index, line.receipt_path)}
                >
                  <Sparkles />
                  Extract and autofill
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`physical-upload-${line.id}`}>
                  Upload a picture of the physical receipt (optional
                  replacement)
                </Label>
                <Input
                  id={`physical-upload-${line.id}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (
                      !["image/jpeg", "image/png", "image/webp"].includes(
                        file.type,
                      )
                    ) {
                      setError(
                        "Use a receipt picture in JPEG, PNG, or WebP format.",
                      );
                      return;
                    }
                    setBusy(true);
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
                      if (aiReady) await extract(index, path);
                    } catch (problem) {
                      setError(
                        problem instanceof Error
                          ? problem.message
                          : "Receipt upload failed.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </div>
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
                    <Label htmlFor={`${key}-${line.id}`}>{label}</Label>
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
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`tag-${line.id}`}>
                    Workbook tag (CE / NCE)
                  </Label>
                  <OptionSelect
                    id={`tag-${line.id}`}
                    value={line.tag}
                    disabled={busy}
                    onValueChange={(tag) => update(index, { tag })}
                    options={[
                      { value: "", label: "Choose the exact workbook tag" },
                      ...tags.map((tag) => ({ value: tag, label: tag })),
                    ]}
                  />
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
                I checked this receipt’s physical copy against its picture,
                amount, supplier, date, and classification.
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
                  receipt_path: initial[0]?.receipt_path ?? "",
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
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          <p>
            Requester total <MoneyText value={total} />
          </p>
          <p>
            Receipt total <MoneyText value={sum / 100} />
          </p>
          <p
            className={
              sum !== Math.round(total * 100)
                ? "text-destructive"
                : "text-muted-foreground"
            }
          >
            Difference{" "}
            <MoneyText value={(sum - Math.round(total * 100)) / 100} />
          </p>
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
        <Button
          type="button"
          disabled={busy || sum !== Math.round(total * 100)}
          onClick={() => void save()}
        >
          {busy ? "Working…" : "Save receipt review"}
        </Button>
      </CardFooter>
    </Card>
  );
}
