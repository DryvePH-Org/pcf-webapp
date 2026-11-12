import Link from "next/link";
import { FundAssignments } from "@/components/admin/fund-assignments";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowDatabase } from "@/lib/workflow";
import { formatPHP } from "@/lib/money";
export default async function FundAssignmentsPage() {
  const user = await requireUser("/funds");
  const db = await createClient();
  const wf = db as unknown as SupabaseClient<WorkflowDatabase>;
  const [funds, custodians, links, approvers, approverLinks] = await Promise.all([
    db.from("funds").select("id,name,amount,per_txn_limit,approval_threshold,is_active").order("name"),
    db.from("profiles").select("id,full_name").eq("role", "custodian").eq("is_active", true).order("full_name"),
    db.from("fund_custodians").select("fund_id,custodian_id"),
    db.from("profiles").select("id,full_name").eq("role", "approver").eq("is_active", true).order("full_name"),
    wf.from("fund_approvers").select("fund_id,approver_id"),
  ]);
  for (const result of [funds, custodians, links, approvers, approverLinks]) if (result.error) throw new Error(result.error.message);
  const names = new Map((custodians.data ?? []).map(c => [c.id, c.full_name]));
  const approverNames = new Map((approvers.data ?? []).map(a => [a.id, a.full_name]));
  return <div className="space-y-6"><PageHeader title="Fund assignments" description="Accounting and administrators assign custodians. Fund amounts, limits, and user accounts remain administrator settings." actions={user.role === "admin" ? <Link className="text-sm underline" href="/admin/funds">Manage fund settings</Link> : undefined} />
    {(funds.data ?? []).map(f => { const selected = (links.data ?? []).filter(l => l.fund_id === f.id).map(l => l.custodian_id); const chosen = (approverLinks.data ?? []).filter(l => l.fund_id === f.id).map(l => l.approver_id); return <section key={f.id} className="space-y-3 rounded-xl border bg-card p-4"><h2 className="font-semibold">{f.name}{f.is_active ? "" : " (inactive)"}</h2><p className="text-sm">Fund {formatPHP(f.amount)} · Transaction limit {formatPHP(f.per_txn_limit)} · Approval from {formatPHP(f.approval_threshold)}</p><p className="text-sm text-muted-foreground">{selected.length ? selected.map(id => names.get(id) ?? "Inactive custodian").join(", ") : "No custodians assigned"}</p><FundAssignments fundId={f.id} name={f.name} selected={selected} custodians={custodians.data ?? []} /><div className="space-y-2 border-t pt-3"><h3 className="text-sm font-medium">Assigned approver</h3><p className="text-sm text-muted-foreground">{chosen.length ? chosen.map(id => approverNames.get(id) ?? "Inactive approver").join(", ") : "None. A custodian's own request is reviewed by another custodian or an administrator."}</p>{user.role === "admin" ? <FundAssignments kind="approver" fundId={f.id} name={f.name} selected={chosen} custodians={approvers.data ?? []} /> : null}</div></section>; })}
    {funds.data?.length === 0 ? <p className="rounded-xl border p-6 text-muted-foreground">No funds configured. An administrator must create the real funds first.</p> : null}
  </div>;
}
