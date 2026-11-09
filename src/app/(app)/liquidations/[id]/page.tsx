import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowDatabase } from "@/lib/workflow";
import { CustodianReceiptReview } from "@/components/liquidations/custodian-receipt-review";
import Link from "next/link";
import { Paperclip } from "lucide-react";
import { Callout } from "@/components/shared/callout";
import { FlowSteps, type FlowStep } from "@/components/shared/flow-steps";
import { LiquidationStatusPill } from "@/components/shared/flow-status-pills";
import { SheetApprovalControl } from "@/components/sheets/approval-control";
import { sheetsAdmin } from "@/lib/sheets/bridge";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { PrintButton } from "@/components/layout/print-button";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import { LiquidationForm } from "@/components/liquidations/liquidation-form";
import { LiquidationActions } from "@/components/liquidations/liquidation-actions";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { LIQUIDATION_LABELS, liquidationDifference } from "@/lib/liquidation";
import type { Json } from "@/lib/database.types";

export default async function LiquidationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ history?: string }> }) {
  const user = await requireUser("/liquidations");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = await createClient();
  const { data: l, error } = await db.from("liquidations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!l) notFound();
  const historyParam = (await searchParams).history ?? "1";
  const historyPage = /^\d+$/.test(historyParam) ? Math.max(1, Math.min(100000, Number(historyParam))) : 1;
  const [items, categories, context, settlements, revisions, editAccess] = await Promise.all([
    db.from("liquidation_items").select("*").eq("liquidation_id", id).order("position"),
    db.from("categories").select("id,name,is_active").order("name"),
    db.rpc("liquidation_context", { p_voucher_id: l.voucher_id }),
    db.from("cash_settlements").select("*").eq("liquidation_id", id).maybeSingle(),
    db.from("liquidation_revisions").select("*", { count: "exact" }).eq("liquidation_id", id).order("revision", { ascending: false }).range((historyPage - 1) * 10, historyPage * 10 - 1),
    db.rpc("can_edit_liquidation", { p_id: id }),
  ]);
  for (const result of [items, categories, context, settlements, revisions, editAccess]) if (result.error) throw new Error(result.error.message);
  const {data:sheetJob}=await sheetsAdmin().from("sheet_jobs").select("status,error,report,updated_at,preview_id").eq("liquidation_id",id).maybeSingle();
  const {data:sheetPreview}=sheetJob?await sheetsAdmin().from("sheet_previews").select("summary").eq("id",sheetJob.preview_id).single():{data:null};
  const sheetSummary=sheetPreview?.summary && typeof sheetPreview.summary === "object" && !Array.isArray(sheetPreview.summary)?sheetPreview.summary:null;
  const workflow = db as unknown as SupabaseClient<WorkflowDatabase>;
  const receiptRows = await workflow.from("liquidation_receipt_lines").select("*").eq("liquidation_id", id).order("position");
  if (receiptRows.error) throw new Error(receiptRows.error.message);
  const flow = l as typeof l & {flow_version:number;receipt_review_revision:number;receipt_reviewed_by:string|null};
  const tagOptions = ["admin","custodian"].includes(user.role)
    ? await workflow.rpc("list_custodian_tags", {p_fund:l.fund_id}) : {data:[],error:null};
  if (tagOptions.error) throw new Error(tagOptions.error.message);
  const rows = items.data ?? [];
  const cats = categories.data ?? [];
  const voucher = context.data?.[0];
  if (!voucher) notFound();
  const difference = liquidationDifference(String(l.amount_received), String(l.total_spent));
  const settlement = settlements.data;
  const canReview = l.status === "submitted" && user.id !== l.owner_id && ["admin", "custodian"].includes(user.role);
  const needsApproval = difference.kind === "reimbursement" && l.total_spent >= voucher.approval_threshold;
  const waitingApproval = needsApproval && !l.reimbursement_approved_by;
  const exceedsLimit = difference.kind === "reimbursement" && l.total_spent > voucher.per_txn_limit;
  const canSettle = l.status === "approved" && difference.kind !== "none" && !settlement && user.id !== l.owner_id && ["admin", "custodian"].includes(user.role) && !waitingApproval && !exceedsLimit && (difference.kind === "return" || voucher.voucher_status !== "rejected");
  const canApproveReimbursement = l.status === "approved" && waitingApproval && !settlement && ![l.owner_id, l.reviewed_by, voucher.prepared_by].includes(user.id) && ["admin", "approver"].includes(user.role) && !exceedsLimit;
  const paths = new Set([...rows, ...(receiptRows.data ?? [])].map(item => item.receipt_path).filter((path): path is string => Boolean(path)));
  for (const r of revisions.data ?? []) for (const line of snapshotItems(r.payload)) if (line.receipt_path) paths.add(line.receipt_path);
  const urls = new Map<string, string>();
  await Promise.all([...paths].map(async path => { const { data, error: linkError } = await db.storage.from("liquidation-receipts").createSignedUrl(path, 600); if (!linkError && data) urls.set(path, data.signedUrl); }));
  const nameByCategory = new Map(cats.map(cat => [cat.id, cat.name]));
  const isOwner = user.id === l.owner_id;
  const settled = Boolean(settlement) || (l.status === "approved" && difference.kind === "none");
  const steps: FlowStep[] = [
    { label: "Cash released", state: "done" },
    { label: "Expenses filed", state: l.status === "draft" ? "current" : "done", hint: l.status === "draft" ? "Not submitted" : undefined },
    { label: "Custodian review", state: l.status === "submitted" ? "current" : l.status === "flagged" ? "stopped" : l.status === "approved" ? "done" : "todo", hint: l.status === "flagged" ? "Needs correction" : undefined },
    { label: "Cash settled", state: settled ? "done" : l.status === "approved" ? "current" : "todo", hint: difference.kind === "none" ? "Nothing to settle" : undefined },
  ];
  const nextStep = () => {
    if (l.status === "flagged") return <Callout tone="danger" title={isOwner ? "Your custodian asked for corrections" : "Waiting for the employee to correct this"}>{l.review_note ? <>Note: {l.review_note}</> : "Fix the expenses below, then submit again."}</Callout>;
    if (l.status === "draft") return <Callout tone="info" title={isOwner ? "Draft: not submitted yet" : "The employee has not submitted this yet"}>{isOwner ? "Check each expense, upload a receipt picture per particular, then choose Submit for review." : "It will appear for review after submission."}</Callout>;
    if (l.status === "submitted") return canReview ? <Callout tone="warning" title="This liquidation needs your review">Complete the receipt entries, verify the physical copies, and save your review before preparing the Google Sheets approval preview.</Callout> : <Callout tone="info" title="Waiting for custodian review">Editing is locked until the custodian responds.</Callout>;
    if (settled) return <Callout tone="success" title={difference.kind === "none" ? "Fully reconciled" : "Settled"}>{difference.kind === "none" ? "The advance matched the expenses, so no cash needs to move." : "The cash movement has been recorded."}</Callout>;
    if (canApproveReimbursement) return <Callout tone="warning" title="Additional reimbursement needs your approval">Spending was above the cash received. An independent approver must approve before the custodian pays it.</Callout>;
    if (canSettle) return <Callout tone="warning" title={difference.kind === "return" ? "Next: record the cash returned" : "Next: record the reimbursement paid"}>Use the button below once the money has actually changed hands.</Callout>;
    if (waitingApproval) return <Callout tone="warning" title="Waiting for an approver">The extra payment needs an independent approver before the custodian can pay it.</Callout>;
    return <Callout tone="info" title={difference.kind === "return" ? "Waiting for the cash to be returned" : "Waiting for the reimbursement to be paid"}>The custodian records it once the cash has actually moved.</Callout>;
  };
  return <div className="space-y-6 print:space-y-4">
    <div className="print:hidden"><PageHeader title="Liquidation / reimbursement" description={`${l.pcv_number} · ${l.fund_name}`} actions={<><PrintButton /><CsvExportButton filename={`${l.pcv_number}-liquidation.csv`} header={["PCV", "Name", "Department", "Filing date", "Particulars", "Category", "Amount", "Receipt attached", "Missing receipt reason", "Advance", "Total spent", "Return amount", "Reimbursement amount", "Status"]} rows={rows.length ? rows.map(item => [l.pcv_number, l.employee_name, l.department, l.filing_date, item.particulars, nameByCategory.get(item.category_id) ?? "", item.amount, item.receipt_path ? "Yes" : "No", item.no_receipt_reason ?? "", l.amount_received, l.total_spent, difference.kind === "return" ? difference.amount : "0", difference.kind === "reimbursement" ? difference.amount : "0", LIQUIDATION_LABELS[l.status]]) : [[l.pcv_number, l.employee_name, l.department, l.filing_date, l.unspent_reason ?? "No expenses", "", 0, "No", "", l.amount_received, l.total_spent, difference.amount, "0", LIQUIDATION_LABELS[l.status]]]} /><Link className="text-sm underline" href="/liquidations">All liquidations</Link></>} /></div>
    {nextStep()}
    <FlowSteps label="Liquidation progress" steps={steps} />
    <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6 print:border-black print:bg-white print:text-black">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="hidden text-xl font-semibold print:block">Liquidation / Reimbursement Form</h1>
          <h2 className="text-xl font-semibold print:hidden">Expense report</h2>
          <p className="font-mono text-sm text-muted-foreground print:text-black">{l.pcv_number} · {l.fund_name}</p>
        </div>
        <LiquidationStatusPill status={l.status} className="print:border print:border-black print:bg-white print:text-black" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Cash received" value={formatPHP(l.amount_received)} />
        <Tile label="Actually spent" value={formatPHP(l.total_spent)} />
        <Tile
          label={difference.kind === "return" ? "Cash to return" : difference.kind === "reimbursement" ? "Owed to employee" : "Difference"}
          value={difference.kind === "none" ? "Balanced" : formatPHP(difference.amount)}
          tone={difference.kind === "return" ? "warning" : difference.kind === "reimbursement" ? "info" : "success"}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3"><Field label="Name" value={l.employee_name} /><Field label="Department" value={l.department || "Not entered"} /><Field label="Filing date" value={formatDate(l.filing_date)} /></div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Expenses ({rows.length})</h3>
        {rows.length === 0 ? <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No expenses listed. {l.unspent_reason ? "" : "The advance was not spent."}</p> : null}
        {rows.map(item => (
          <div key={item.id} className="break-inside-avoid space-y-2 rounded-lg border p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-medium"><span className="text-muted-foreground">{item.position}.</span> {item.particulars}</p>
              <span className="font-semibold whitespace-nowrap tabular-nums">{formatPHP(item.amount)}</span>
            </div>
            {flow.flow_version!==2 ? <p className="text-sm text-muted-foreground print:text-black">{nameByCategory.get(item.category_id) ?? "—"}</p> : null}
            {item.receipt_path ? (
              urls.has(item.receipt_path)
                ? <a href={urls.get(item.receipt_path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800 underline underline-offset-4"><Paperclip className="size-4" aria-hidden />View receipt</a>
                : <p className="text-sm font-medium text-destructive">Receipt attachment currently unavailable</p>
            ) : (
              <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900 print:bg-white print:text-black"><span className="font-semibold">No receipt:</span> {item.no_receipt_reason || "Receipt picture required before submission"}</p>
            )}
          </div>
        ))}
      </div>
      {l.unspent_reason ? <Field label="Why the advance was not spent" value={l.unspent_reason} /> : null}
      {l.reviewed_at ? <div className="space-y-2 border-t pt-3"><Field label="Custodian review" value={`${l.reviewer_name} · ${formatDateTime(l.reviewed_at)}`} />{l.review_note ? <Field label="Review note" value={l.review_note} /> : null}</div> : null}
      {l.status === "approved" ? (
        <div className="space-y-2 border-t pt-3">
          <h3 className="font-semibold">Cash settlement</h3>
          {settlement ? (
            <>
              <p>{settlement.kind === "return" ? "Cash received back" : "Reimbursement paid"}: <strong>{formatPHP(settlement.amount)}</strong></p>
              <p className="text-sm text-muted-foreground">Recorded by {settlement.recorder_name} · {formatDateTime(settlement.created_at)}</p>
              {settlement.note ? <p>{settlement.note}</p> : null}
            </>
          ) : (
            <p>{difference.kind === "none" ? "Fully reconciled. No cash transfer is needed." : `Pending ${difference.kind === "return" ? "cash return" : "reimbursement payment"}. Approval alone has not changed cash.`}</p>
          )}
          {voucher.voucher_status === "rejected" ? <p className="text-sm font-medium text-destructive">The voucher is flagged. Additional payment and replenishment wait until that flag is resolved.</p> : null}
          {waitingApproval ? <p className="text-sm font-medium text-amber-800">An independent approver must approve before the additional payment.</p> : null}
          {l.reimbursement_approved_at ? <p className="text-sm">Additional payment approved {formatDateTime(l.reimbursement_approved_at)}</p> : null}
          {exceedsLimit ? <p className="text-sm font-medium text-destructive">Actual spending exceeds this fund&apos;s transaction limit. Ask an administrator to resolve the fund policy before payment.</p> : null}
        </div>
      ) : null}
    </section>
    {editAccess.data ? <LiquidationForm employeeName={l.employee_name} key={`${l.id}:${l.updated_at}`} received={Number(l.amount_received).toFixed(2)} initial={{ id: l.id, department: l.department, filing_date: l.filing_date, unspent_reason: l.unspent_reason ?? "", items: rows.map(item => ({ id: item.id, sheet_details: {plate:(item.sheet_details as Record<string,string>|null)?.plate??''}, particulars: item.particulars, amount: Number(item.amount).toFixed(2), category_id: item.category_id, receipt_path: item.receipt_path ?? "", no_receipt_reason: item.no_receipt_reason ?? "" })) }} /> : null}
    {sheetJob?<section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Google Sheets update report</h2><p>{sheetJob.status==='synced'?'Delivered':'Approved — sheet update pending'} · {formatDateTime(sheetJob.updated_at)}</p>{sheetJob.error?<p className="text-sm text-destructive">{sheetJob.error}</p>:null}{sheetSummary?<div className="space-y-2 text-sm"><p>{String(sheetSummary.workbook??'')} · {String(sheetSummary.worksheet??'')}</p><p>{Array.isArray(sheetSummary.expenses)?sheetSummary.expenses.length:0} expense rows · {formatPHP(Number(sheetSummary.total??0))}</p>{typeof sheetSummary.url==='string'&&sheetSummary.url.startsWith('https://docs.google.com/spreadsheets/d/')?<a className="underline" href={sheetSummary.url} target="_blank" rel="noreferrer">Open updated worksheet</a>:null}</div>:null}{sheetJob.status!=='synced'&&['custodian','admin'].includes(user.role)?<SheetApprovalControl id={id} retry/>:null}</section>:null}
    <LiquidationActions canPrepareApproval={flow.flow_version!==2} id={id} canReview={canReview} canSettle={canSettle} canApproveReimbursement={canApproveReimbursement} amount={difference.amount} kind={difference.kind} />
    {canReview && flow.flow_version===2 ? <CustodianReceiptReview key={`${id}:${flow.receipt_review_revision}`} id={id} revision={flow.receipt_review_revision} total={Number(l.total_spent)} filingDate={l.filing_date} tags={tagOptions.data??[]} urls={Object.fromEntries(urls)} aiReady={Boolean(process.env.OPENAI_API_KEY)} reviewSaved={flow.receipt_reviewed_by===user.id}
      initial={receiptRows.data?.length ? receiptRows.data.map(row=>({...row,amount:String(row.amount),receipt_path:row.receipt_path??''})) : rows.map(item=>({id:item.id,particulars:item.particulars,amount:String(item.amount),supplier:'',tin:'',tag:'',expense_date:l.filing_date,plate:(item.sheet_details as Record<string,string>|null)?.plate??'',receipt_number:'',receipt_path:item.receipt_path??'',physical_checked:false}))} /> : null}
    {receiptRows.data?.length ? <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Custodian receipt entries</h2>{receiptRows.data.map(row=><div key={row.id} className="space-y-1 border-t pt-3 text-sm"><p>{row.supplier} · {row.tag} · {formatDate(row.expense_date)}</p><p>{row.particulars} · {formatPHP(row.amount)}</p><p>TIN {row.tin} · Plate {row.plate||'—'} · Receipt {row.receipt_number||'—'}</p><p className="text-muted-foreground">Physical receipt checked</p></div>)}</section>:null}
    <section className="space-y-3 print:hidden"><h2 className="font-semibold">Submission history</h2><p className="text-sm text-muted-foreground">Every submitted version is retained, including its receipt references. Page {historyPage}.</p>{(revisions.data ?? []).map(r => <details key={r.id} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">Submission {r.revision} · {LIQUIDATION_LABELS[r.status]} · {formatDateTime(r.created_at)}</summary><div className="mt-3 space-y-3">{r.review_note ? <p>{r.review_note}</p> : null}{snapshotItems(r.payload).map((item, index) => <div key={index}><p>{item.particulars} · {formatPHP(item.amount)}</p>{item.receipt_path ? (urls.has(item.receipt_path) ? <a href={urls.get(item.receipt_path)} target="_blank" rel="noreferrer" className="text-sm underline">Submitted receipt</a> : <p className="text-sm text-destructive">Submitted receipt currently unavailable</p>) : <p className="text-sm">No receipt: {item.no_receipt_reason}</p>}</div>)}</div></details>)}<div className="flex justify-between">{historyPage > 1 ? <Link className="underline" href={`?history=${historyPage - 1}`}>Previous submissions</Link> : <span />}{historyPage * 10 < (revisions.count ?? 0) ? <Link className="underline" href={`?history=${historyPage + 1}`}>Older submissions</Link> : null}</div></section>
  </div>;
}
function Tile({ label, value, tone }: { label: string; value: string; tone?: "warning" | "info" | "success" }) {
  const box = tone === "warning" ? "bg-amber-50 text-amber-950" : tone === "info" ? "bg-sky-50 text-sky-950" : tone === "success" ? "bg-emerald-50 text-emerald-950" : "bg-muted/60";
  return <div className={`rounded-lg p-4 print:border print:border-black print:bg-white print:text-black ${box}`}><p className="text-[13px] font-medium opacity-80">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>;
}
function Field({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-[13px] font-medium text-muted-foreground print:text-black">{label}</p><p className="mt-1 whitespace-pre-wrap break-words font-medium">{value}</p></div>; }
function snapshotItems(payload: Json) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.items)) return [];
  return payload.items.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.particulars !== "string" || typeof item.amount !== "number") return [];
    return [{ particulars: item.particulars, amount: item.amount, receipt_path: typeof item.receipt_path === "string" ? item.receipt_path : "", no_receipt_reason: typeof item.no_receipt_reason === "string" ? item.no_receipt_reason : "" }];
  });
}
