import Link from "next/link";
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
  const paths = new Set(rows.map(item => item.receipt_path).filter((path): path is string => Boolean(path)));
  for (const r of revisions.data ?? []) for (const line of snapshotItems(r.payload)) if (line.receipt_path) paths.add(line.receipt_path);
  const urls = new Map<string, string>();
  await Promise.all([...paths].map(async path => { const { data, error: linkError } = await db.storage.from("liquidation-receipts").createSignedUrl(path, 600); if (!linkError && data) urls.set(path, data.signedUrl); }));
  const nameByCategory = new Map(cats.map(cat => [cat.id, cat.name]));
  return <div className="space-y-6 print:space-y-4">
    <div className="print:hidden"><PageHeader title="Liquidation / reimbursement" description={`${l.pcv_number} · ${l.fund_name}`} actions={<><PrintButton /><CsvExportButton filename={`${l.pcv_number}-liquidation.csv`} header={["PCV", "Name", "Department", "Filing date", "Particulars", "Category", "Amount", "Receipt attached", "Missing receipt reason", "Advance", "Total spent", "Return amount", "Reimbursement amount", "Status"]} rows={rows.length ? rows.map(item => [l.pcv_number, l.employee_name, l.department, l.filing_date, item.particulars, nameByCategory.get(item.category_id) ?? "", item.amount, item.receipt_path ? "Yes" : "No", item.no_receipt_reason ?? "", l.amount_received, l.total_spent, difference.kind === "return" ? difference.amount : "0", difference.kind === "reimbursement" ? difference.amount : "0", LIQUIDATION_LABELS[l.status]]) : [[l.pcv_number, l.employee_name, l.department, l.filing_date, l.unspent_reason ?? "No expenses", "", 0, "No", "", l.amount_received, l.total_spent, difference.amount, "0", LIQUIDATION_LABELS[l.status]]]} /><Link className="text-sm underline" href="/liquidations">All liquidations</Link></>} /></div>
    <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6 print:border-black print:bg-white print:text-black">
      <h1 className="text-xl font-semibold">Liquidation / Reimbursement Form</h1>
      <p className="font-mono">{l.pcv_number} · {l.fund_name}</p>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Name" value={l.employee_name} /><Field label="Department" value={l.department || "Not entered"} /><Field label="Filing date" value={formatDate(l.filing_date)} /><Field label="Status" value={LIQUIDATION_LABELS[l.status]} /></div>
      <div className="grid gap-4 sm:grid-cols-3"><Field label="Amount received by employee" value={formatPHP(l.amount_received)} /><Field label="Amount spent by employee" value={formatPHP(l.total_spent)} /><Field label={difference.kind === "return" ? "Cash return amount" : difference.kind === "reimbursement" ? "Reimbursement amount" : "No cash adjustment needed"} value={formatPHP(difference.amount)} /></div>
      <div className="space-y-3">{rows.map(item => <div key={item.id} className="break-inside-avoid rounded-lg border p-3"><p className="font-medium">{item.position}. {item.particulars}</p><p>{formatPHP(item.amount)} · {nameByCategory.get(item.category_id) ?? "—"}</p>{item.receipt_path ? (urls.has(item.receipt_path) ? <a href={urls.get(item.receipt_path)} target="_blank" rel="noreferrer" className="text-sm underline">View receipt attachment</a> : <p className="text-sm text-destructive">Receipt attachment currently unavailable</p>) : <p className="text-sm text-muted-foreground">No receipt: {item.no_receipt_reason || "Reason required before submission"}</p>}</div>)}</div>
      {l.unspent_reason ? <Field label="Why the advance was not spent" value={l.unspent_reason} /> : null}
      {l.reviewed_at ? <div className="space-y-2 border-t pt-3"><Field label="Custodian review" value={`${l.reviewer_name} · ${formatDateTime(l.reviewed_at)}`} />{l.review_note ? <Field label="Review note" value={l.review_note} /> : null}</div> : null}
      {l.status === "approved" ? <div className="space-y-2 border-t pt-3"><h2 className="font-semibold">Cash settlement</h2>{settlement ? <><p>{settlement.kind === "return" ? "Cash received back" : "Reimbursement paid"}: {formatPHP(settlement.amount)}</p><p className="text-sm">Recorded by {settlement.recorder_name} · {formatDateTime(settlement.created_at)}</p>{settlement.note ? <p>{settlement.note}</p> : null}</> : <p>{difference.kind === "none" ? "Fully reconciled. No cash transfer is needed." : `Pending ${difference.kind === "return" ? "cash return" : "reimbursement payment"}. Approval alone has not changed cash.`}</p>}{voucher.voucher_status === "rejected" ? <p className="text-sm text-destructive">The voucher is flagged. Additional payment and replenishment wait until that flag is resolved.</p> : null}{waitingApproval ? <p className="text-sm text-amber-700">Independent approver approval is required before the additional payment.</p> : null}{l.reimbursement_approved_at ? <p className="text-sm">Additional payment approved {formatDateTime(l.reimbursement_approved_at)}</p> : null}{exceedsLimit ? <p className="text-sm text-destructive">Actual spending exceeds this fund&apos;s transaction limit. Ask an administrator to resolve the fund policy before payment.</p> : null}</div> : null}
    </section>
    {editAccess.data ? <LiquidationForm key={`${l.id}:${l.updated_at}`} received={Number(l.amount_received).toFixed(2)} categories={cats.filter(c => c.is_active)} initial={{ id: l.id, department: l.department, filing_date: l.filing_date, unspent_reason: l.unspent_reason ?? "", items: rows.map(item => ({ id: item.id, particulars: item.particulars, amount: Number(item.amount).toFixed(2), category_id: item.category_id, receipt_path: item.receipt_path ?? "", no_receipt_reason: item.no_receipt_reason ?? "" })) }} /> : null}
    <LiquidationActions id={id} canReview={canReview} canSettle={canSettle} canApproveReimbursement={canApproveReimbursement} amount={difference.amount} kind={difference.kind} />
    <section className="space-y-3 print:hidden"><h2 className="font-semibold">Submission history</h2><p className="text-sm text-muted-foreground">Every submitted version is retained, including its receipt references. Page {historyPage}.</p>{(revisions.data ?? []).map(r => <details key={r.id} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">Submission {r.revision} · {LIQUIDATION_LABELS[r.status]} · {formatDateTime(r.created_at)}</summary><div className="mt-3 space-y-3">{r.review_note ? <p>{r.review_note}</p> : null}{snapshotItems(r.payload).map((item, index) => <div key={index}><p>{item.particulars} · {formatPHP(item.amount)}</p>{item.receipt_path ? (urls.has(item.receipt_path) ? <a href={urls.get(item.receipt_path)} target="_blank" rel="noreferrer" className="text-sm underline">Submitted receipt</a> : <p className="text-sm text-destructive">Submitted receipt currently unavailable</p>) : <p className="text-sm">No receipt: {item.no_receipt_reason}</p>}</div>)}</div></details>)}<div className="flex justify-between">{historyPage > 1 ? <Link className="underline" href={`?history=${historyPage - 1}`}>Previous submissions</Link> : <span />}{historyPage * 10 < (revisions.count ?? 0) ? <Link className="underline" href={`?history=${historyPage + 1}`}>Older submissions</Link> : null}</div></section>
  </div>;
}
function Field({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-xs text-muted-foreground print:text-black">{label}</p><p className="mt-1 whitespace-pre-wrap break-words font-medium">{value}</p></div>; }
function snapshotItems(payload: Json) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.items)) return [];
  return payload.items.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.particulars !== "string" || typeof item.amount !== "number") return [];
    return [{ particulars: item.particulars, amount: item.amount, receipt_path: typeof item.receipt_path === "string" ? item.receipt_path : "", no_receipt_reason: typeof item.no_receipt_reason === "string" ? item.no_receipt_reason : "" }];
  });
}
