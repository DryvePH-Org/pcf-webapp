"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type ExportFund = { id: string; name: string; template: { fileName: string; uploadedAt: string } | null };

type Check = {
  matches: boolean;
  appClosing: number;
  report: { sheet: string; entries: number; capacity: number; totalOut: number; openingBalance: number | null; closingBalance: number | null; warnings: string[] };
};

const money = (value: number | null) => (value === null ? "unknown" : `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

async function failure(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return new Error(body?.error ?? fallback);
}

function FundExport({ fund, canUpload }: { fund: ExportFund; canUpload: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "check" | "download" | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const url = `/api/accounting/ledger-export?fund=${fund.id}`;

  async function run<T>(kind: "upload" | "check" | "download", work: () => Promise<T>) {
    setBusy(kind);
    try {
      return await work();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const upload = (file: File) =>
    run("upload", async () => {
      const form = new FormData();
      form.set("fund", fund.id);
      form.set("file", file);
      const response = await fetch("/api/accounting/ledger-export", { method: "POST", body: form });
      if (!response.ok) throw await failure(response, "Could not upload the template.");
      setCheck(null);
      toast.success("Template saved.");
      router.refresh();
    });

  const runCheck = () =>
    run("check", async () => {
      const response = await fetch(`${url}&check=1`, { cache: "no-store", signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw await failure(response, "Could not check the export.");
      setCheck(await response.json());
    });

  const download = () =>
    run("download", async () => {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw await failure(response, "Could not build the export.");
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "pcf-ledger.xlsx";
      const object = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = object;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(object);
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="size-4" />
            {fund.name}
          </CardTitle>
          {fund.template ? <Badge variant="secondary">Template ready</Badge> : <Badge variant="outline">No template yet</Badge>}
        </div>
        <CardDescription>
          {fund.template
            ? `${fund.template.fileName} · uploaded ${new Date(fund.template.uploadedAt).toLocaleDateString("en-PH")}`
            : canUpload
              ? "Upload this fund's Excel ledger (File → Download → Microsoft Excel in Google Sheets)."
              : "An administrator needs to upload this fund's Excel ledger first."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {canUpload && (
            <>
              <input
                ref={input}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void upload(file);
                }}
              />
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => input.current?.click()}>
                {busy === "upload" ? <Loader2 className="animate-spin" /> : <Upload />}
                {fund.template ? "Replace template" : "Upload template"}
              </Button>
            </>
          )}
          <Button type="button" variant="outline" disabled={!fund.template || busy !== null} onClick={() => void runCheck()}>
            {busy === "check" && <Loader2 className="animate-spin" />}
            Check first
          </Button>
          <Button type="button" disabled={!fund.template || busy !== null} onClick={() => void download()}>
            {busy === "download" ? <Loader2 className="animate-spin" /> : <Download />}
            Download Excel
          </Button>
        </div>
        {check && (
          <Alert variant={check.matches ? "default" : "destructive"}>
            {check.matches ? <CheckCircle2 /> : <TriangleAlert />}
            <AlertTitle>{check.matches ? "The file matches the app" : "The file does not match the app"}</AlertTitle>
            <AlertDescription>
              <p>
                {check.report.entries} of {check.report.capacity} ledger rows filled on “{check.report.sheet}”, {money(check.report.totalOut)} spent. The file closes at{" "}
                {money(check.report.closingBalance)}; the app expects {money(check.appClosing)}.
              </p>
              {check.report.warnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {check.report.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function LedgerExportList({ funds, canUpload }: { funds: ExportFund[]; canUpload: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {funds.map((fund) => (
        <FundExport key={fund.id} fund={fund} canUpload={canUpload} />
      ))}
    </div>
  );
}
