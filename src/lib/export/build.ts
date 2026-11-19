import "server-only";
import ExcelJS from "exceljs";

import { todayInAppTz } from "@/lib/dates";

import { loadFundLedger } from "./ledger-data";
import { addExportNote, fillLedger, keepCurrentTabOnly, type FillReport } from "./ledger-fill";
import { loadTemplateFile, templateFor } from "./templates";

export type LedgerExport = {
  buffer: Buffer;
  fileName: string;
  fund: string;
  report: FillReport;
  appClosing: number;
  matches: boolean;
};

const cents = (value: number) => Math.round(value * 100);

// One fund's ledger, from the app's data, laid out in the fund's own template.
export async function buildLedgerExport(fundId: string): Promise<LedgerExport> {
  const template = await templateFor(fundId);
  if (!template) throw new Error("Upload this fund's Excel template first.");
  const [ledger, file] = await Promise.all([loadFundLedger(fundId), loadTemplateFile(template.storage_path)]);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as ArrayBuffer);
  const report = fillLedger(workbook, ledger.entries);
  keepCurrentTabOnly(workbook, report.warnings);
  const matches = report.closingBalance !== null && cents(report.closingBalance) === cents(ledger.expectedClosing);
  if (report.openingBalance !== null && !matches)
    report.warnings.push(
      `The file closes at ${report.closingBalance?.toFixed(2)} but the app expects ${ledger.expectedClosing.toFixed(2)} (fund amount ${Number(ledger.fund.amount).toFixed(2)} less ${report.totalOut.toFixed(2)} spent). Check the template's opening balance and any additional funds.`,
    );
  addExportNote(workbook, {
    fund: ledger.fund.name,
    generatedAt: new Date().toISOString(),
    report,
    appClosing: ledger.expectedClosing,
  });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const safeName = ledger.fund.name.replace(/[^A-Za-z0-9 _-]+/g, "").trim() || "fund";
  return { buffer, fileName: `${safeName} PCF ledger ${todayInAppTz()}.xlsx`, fund: ledger.fund.name, report, appClosing: ledger.expectedClosing, matches };
}
