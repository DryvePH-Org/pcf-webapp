import { VoucherLiquidationPanel } from "@/components/liquidations/voucher-liquidation-panel";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { PrintButton } from "@/components/layout/print-button";
import { RequestActions } from "@/components/requests/request-actions";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { formatPHP } from "@/lib/money";
import { canAccessRoute, canPerform } from "@/lib/permissions";
import { requestStatusLabel } from "@/lib/request-status";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("/requests");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: request, error } = await supabase.from("budget_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!request) notFound();
  const [{ data: vouchers, error: voucherError }, { data: funds, error: fundError }] = await Promise.all([
    supabase.rpc("request_voucher_summary", { p_request_id: id }),
    supabase.rpc("list_request_funds"),
  ]);
  if (voucherError) throw new Error(voucherError.message);
  if (fundError) throw new Error(fundError.message);
  const fund = funds.find(f => f.id === request.fund_id);
  const { data: assignments, error: assignmentError } = user.role === "custodian"
    ? await supabase.from("fund_custodians").select("fund_id").eq("fund_id", request.fund_id).eq("custodian_id", user.id)
    : { data: [], error: null };
  if (assignmentError) throw new Error(assignmentError.message);
  const canManage = canPerform(user.role, "request.review") && (user.role === "admin" || Boolean(assignments?.length)) && request.requester_id !== user.id;
  const voucher = vouchers[0];
  return <div className="space-y-6 print:space-y-4">
    <div className="print:hidden"><PageHeader title="Budget request" description={request.request_no} actions={<><PrintButton /><CsvExportButton filename={`${request.request_no}.csv`} header={["Request", "Name", "Fund", "Budget", "Purpose", "Status", "Review note"]} rows={[[request.request_no, request.requester_name, request.fund_name, request.amount, request.purpose, requestStatusLabel(request.status), request.review_note ?? ""]]} /><Button variant="outline" nativeButton={false} render={<Link href="/requests" />}>All requests</Button></>} /></div>
    <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6 print:rounded-none print:border-black print:bg-white print:text-black">
      <div><h2 className="text-xl font-semibold">Budget request</h2><p className="break-all font-mono text-sm">{request.request_no}</p></div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={request.requester_name} /><Field label="Budget requested" value={formatPHP(request.amount)} />
        <Field label="Fund" value={request.fund_name} /><Field label="Current custodians" value={fund?.custodian_names.join(", ") ?? "No active custodian available"} />
        <Field label="Submitted" value={formatDateTime(request.created_at)} /><Field label="Status" value={requestStatusLabel(request.status)} />
      </dl>
      <Field label="Purpose of the budget" value={request.purpose} />
      {request.reviewed_at ? <div className="space-y-3 border-t pt-4"><Field label="Reviewed by" value={request.reviewer_name ?? "—"} /><Field label="Reviewed on" value={formatDateTime(request.reviewed_at)} />{request.review_note ? <Field label="Review note" value={request.review_note} /> : null}</div> : null}
      <p className="text-sm text-muted-foreground print:text-black">Request approval does not release cash. The linked voucher follows the fund&apos;s approval limit and release rules.</p>
    </section>
    {voucher ? <section className="space-y-3 rounded-xl border p-4 print:border-black">
      <h2 className="font-semibold">Linked petty cash voucher</h2>
      {canAccessRoute(user.role, "/vouchers") && (user.role !== "custodian" || Boolean(assignments?.length)) ? <Link href={`/vouchers/${voucher.id}`} className="font-mono underline">{voucher.pcv_number}</Link> : <p className="font-mono">{voucher.pcv_number}</p>}
      <div className="flex flex-wrap items-center gap-3"><span className="font-semibold">{formatPHP(voucher.amount)}</span><StatusBadge status={voucher.status} /></div>
      <p className="text-sm">{voucher.released_at ? `Cash released ${formatDateTime(voucher.released_at)}` : "Cash has not been released."}</p>
    </section> : null}
    {voucher ? <VoucherLiquidationPanel voucherId={voucher.id} userId={user.id} /> : null}
    <RequestActions id={id} canReview={canManage && request.status === "submitted"} canCreateVoucher={canManage && request.status === "approved"} canCancel={(request.requester_id === user.id || user.role === "admin") && ["submitted", "approved"].includes(request.status)} />
  </div>;
}
function Field({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground print:text-black">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd></div>;
}
