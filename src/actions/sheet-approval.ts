"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/database.types";
import { sheetsAdmin } from "@/lib/sheets/database";
import {
  GROKBOT_BUYING_TARGET,
  grokbotFinancialEvent,
} from "@/lib/grokbot/contract";
import {
  dispatchGrokbot,
  queueGrokbotOperation,
  retryGrokbotOperation,
} from "@/lib/grokbot/delivery";
import { type ExpenseForSheet } from "@/lib/sheets/types";
import type { SheetsDatabase, SheetTab } from "@/lib/sheets/types";
import type { WorkflowDatabase } from "@/lib/workflow";
import { safeDbMessage } from "@/lib/db-error";
export async function previewSheetApproval(id: string) {
  const user = await getCurrentUser();
  if (
    !user ||
    !["custodian", "admin"].includes(user.role) ||
    !z.uuid().safeParse(id).success
  )
    return { ok: false as const, error: "Custodian access required." };
  const db = await createClient();
  const l = await db.from("liquidations").select("*").eq("id", id).single();
  if (l.error || !l.data || l.data.owner_id === user.id)
    return { ok: false as const, error: "Liquidation unavailable for review." };
  const access = await db.rpc("can_access_fund", { p_fund_id: l.data.fund_id });
  if (access.error || !access.data)
    return { ok: false as const, error: "This fund is not assigned to you." };
  const admin = sheetsAdmin();
  const existing = await admin
    .from("sheet_jobs")
    .select("*")
    .eq("liquidation_id", id)
    .maybeSingle();
  if (existing.error)
    return {
      ok: false as const,
      error: "Could not read the current Sheets delivery status.",
    };
  if (
    l.data.status !== "submitted" &&
    !(l.data.status === "approved" && existing.data)
  )
    return {
      ok: false as const,
      error:
        "Only submitted liquidations or pending sheet updates can be reviewed.",
    };
  try {
    let configs = admin.from("sheet_workbooks").select("*");
    configs = existing.data
      ? configs.eq("id", existing.data.book_id)
      : configs
          .eq("custodian_id", user.id)
          .eq("fund_id", l.data.fund_id)
          .eq("enabled", true);
    const w = await configs.single();
    if (
      w.error ||
      !w.data ||
      w.data.custodian_id !== user.id ||
      w.data.fund_id !== l.data.fund_id ||
      !w.data.enabled ||
      w.data.active_sheet_id === null
    )
      throw new Error(
        "Ask Accounting to enable a workbook for your custodian, fund, and active worksheet.",
      );
    if (
      w.data.id !== "buying" ||
      w.data.spreadsheet_id !== GROKBOT_BUYING_TARGET.spreadsheet_id ||
      w.data.active_sheet_id !== GROKBOT_BUYING_TARGET.sheet_id
    )
      throw new Error(
        "Grokbot currently supports the configured MAD Buying worksheet. Configure the workbook before approving this sheet update.",
      );
    if (existing.data?.status === "synced")
      throw new Error(
        "This liquidation is already encoded. Refresh to view its report.",
      );
    if (
      existing.data &&
      !z.uuid().safeParse(existing.data.operation_id).success
    )
      throw new Error(
        "This earlier delivery needs reconciliation before migration to Grokbot. Ask an administrator to inspect its saved report.",
      );
    const pendingRollover = await admin
      .from("sheet_rollovers")
      .select("id")
      .eq("book_id", w.data.id)
      .eq("status", "pending")
      .limit(1);
    if (pendingRollover.error)
      throw new Error("Could not verify worksheet rollover status.");
    if (!existing.data && pendingRollover.data?.length)
      throw new Error(
        "Complete the pending Grokbot replenishment marker before synchronizing more expenses.",
      );
    const items = await db
      .from("liquidation_items")
      .select("*")
      .eq("liquidation_id", id)
      .order("position");
    const cats = await db.from("categories").select("id,name");
    if (items.error || cats.error) throw new Error("Could not load expenses.");
    const flow = l.data as typeof l.data & {
      flow_version: number;
      receipt_review_revision: number;
      receipt_reviewed_by: string | null;
    };
    const newFlow = flow.flow_version === 2;
    const workflow = db as unknown as SupabaseClient<WorkflowDatabase>;
    const receipts = await workflow
      .from("liquidation_receipt_lines")
      .select("*")
      .eq("liquidation_id", id)
      .order("position");
    if (receipts.error)
      throw new Error("Could not load the custodian receipt review.");
    if (newFlow && !existing.data && flow.receipt_reviewed_by !== user.id)
      throw new Error(
        "Complete and save the expense review before preparing approval.",
      );
    const voucher = await db
      .from("vouchers")
      .select("*")
      .eq("id", l.data.voucher_id)
      .single();
    if (voucher.error) throw new Error("Could not read the voucher number.");
    const voucherNumber =
      (voucher.data as typeof voucher.data & { flow_version: number })
        .flow_version === 2
        ? (voucher.data.paper_pcv_number ?? "")
        : l.data.pcv_number;
    const legacyExpenses = (newFlow ? [] : (items.data ?? [])).map((item) => {
      const detail =
        (item as typeof item & { sheet_details?: Record<string, string> })
          .sheet_details ?? {};
      if (!detail.expense_date)
        throw new Error(
          `Enter the actual expense date for expense ${item.position}. Flag it for correction if needed.`,
        );
      return {
        id: item.id,
        expense_date: detail.expense_date,
        particulars: item.particulars,
        amount: Number(item.amount),
        category:
          detail.sheet_category ||
          (cats.data?.find((c) => c.id === item.category_id)?.name ?? ""),
        person: l.data.employee_name,
        supplier: detail.supplier ?? "",
        plate: detail.plate ?? "",
        receipt_number: detail.receipt_number ?? "",
        tin: detail.tin ?? "",
        address: detail.address ?? "",
        voucher: l.data.pcv_number,
        company: detail.company || (w.data.id === "dryve" ? "DRYVE" : "MAD"),
      };
    });
    const expenses: ExpenseForSheet[] = newFlow
      ? (receipts.data ?? []).map((receipt) => ({
          id: receipt.id,
          expense_date: receipt.expense_date,
          particulars: receipt.particulars,
          amount: Number(receipt.amount),
          category: receipt.tag,
          person: l.data.employee_name,
          supplier: receipt.supplier,
          plate: receipt.plate,
          receipt_number: receipt.receipt_number,
          tin: receipt.tin,
          address: "",
          voucher: voucherNumber,
          company: w.data.id === "dryve" ? "DRYVE" : "MAD",
        }))
      : legacyExpenses;
    if (
      newFlow &&
      Math.round(
        expenses.reduce((sum, expense) => sum + expense.amount, 0) * 100,
      ) !== Math.round(Number(l.data.total_spent) * 100)
    )
      throw new Error("Receipt entries do not match the requester total.");
    const formulaTags =
      (w.data.catalog as unknown as SheetTab[]).find(
        (tab) => tab.sheetId === w.data.active_sheet_id,
      )?.expenseTags ?? [];
    const customTags = expenses.filter(
      (expense) =>
        formulaTags.length && !formulaTags.includes(expense.category),
    );
    const operation = existing.data?.operation_id ?? randomUUID();
    const received = Math.round(Number(l.data.amount_received) * 100);
    const spent = Math.round(Number(l.data.total_spent) * 100);
    const event = grokbotFinancialEvent.parse({
      protocol_version: "pcf.grokbot.v1",
      operation_id: operation,
      event: "pcf.liquidation.approved",
      target: GROKBOT_BUYING_TARGET,
      liquidation_id: id,
      voucher_id: l.data.voucher_id,
      voucher_number: voucherNumber,
      requester_name: l.data.employee_name,
      department: l.data.department,
      filing_date: l.data.filing_date,
      custodian_approved_at: l.data.reviewed_at ?? new Date().toISOString(),
      custodian_id: user.id,
      amount_received: (received / 100).toFixed(2),
      total_spent: (spent / 100).toFixed(2),
      return_amount: (Math.max(received - spent, 0) / 100).toFixed(2),
      reimbursement_amount: (Math.max(spent - received, 0) / 100).toFixed(2),
      lines: expenses.map((expense) => ({
        entry_id: expense.id,
        particulars: expense.particulars,
        amount: expense.amount.toFixed(2),
        tag: expense.category,
        expense_date: expense.expense_date,
        supplier: expense.supplier,
        tin: expense.tin,
        receipt_number: expense.receipt_number,
        plate: expense.plate,
      })),
    });
    const tab = (w.data.catalog as unknown as SheetTab[]).find(
      (t) => t.sheetId === w.data.active_sheet_id,
    );
    const previewId = randomUUID();
    const summary = {
      review_revision: flow.receipt_review_revision,
      warning: customTags.length
        ? "Custom tags appear in the ledger and Accounting dashboard. Existing worksheet tag subtotals count their configured tags."
        : "",
      workbook: w.data.name,
      worksheet: tab?.title ?? String(w.data.active_sheet_id),
      expenses,
      total: expenses.reduce((s, i) => s + i.amount, 0),
      url: `https://docs.google.com/spreadsheets/d/${w.data.spreadsheet_id}/edit#gid=${w.data.active_sheet_id}`,
    };
    const saved = await admin.from("sheet_previews").insert({
      id: previewId,
      liquidation_id: id,
      reviewer_id: user.id,
      revision: l.data.revision,
      book_id: w.data.id,
      config_version: w.data.config_version,
      sheet_id: w.data.active_sheet_id,
      sheet_name: summary.worksheet,
      operation_id: operation,
      requests: event as unknown as Json,
      google_token: "grokbot.v1",
      summary: summary as unknown as Json,
      expires_at: new Date(Date.now() + 240000).toISOString(),
      created_at: new Date().toISOString(),
    });
    if (saved.error) throw new Error("Could not save update preview.");
    return {
      ok: true as const,
      id: previewId,
      summary,
      retry: Boolean(existing.data),
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not prepare the update.",
    };
  }
}
export async function confirmSheetApproval(previewId: string) {
  const user = await getCurrentUser();
  if (!user || !z.uuid().safeParse(previewId).success)
    return { ok: false, error: "Sign in first." };
  const admin = sheetsAdmin();
  const p = await admin
    .from("sheet_previews")
    .select("*")
    .eq("id", previewId)
    .single();
  if (
    p.error ||
    p.data.reviewer_id !== user.id ||
    Date.parse(p.data.expires_at) < Date.now()
  )
    return { ok: false, error: "Preview expired. Review the update again." };
  const db =
    (await createClient()) as unknown as SupabaseClient<SheetsDatabase>;
  let job = await admin
    .from("sheet_jobs")
    .select("*")
    .eq("liquidation_id", p.data.liquidation_id)
    .maybeSingle();
  if (job.data?.status === "synced")
    return {
      ok: true,
      status: "synced" as const,
      message: "Already delivered. View the saved report.",
    };
  if (job.data) {
    const w = await admin
      .from("sheet_workbooks")
      .select("*")
      .eq("id", p.data.book_id)
      .single();
    if (
      w.error ||
      w.data.custodian_id !== user.id ||
      w.data.config_version !== p.data.config_version ||
      job.data.book_id !== p.data.book_id
    )
      return { ok: false, error: "Assignment changed. Review again." };
    const updated = await admin
      .from("sheet_jobs")
      .update({ preview_id: previewId })
      .eq("id", job.data.id);
    if (updated.error) return { ok: false, error: "Could not record retry." };
  } else {
    const approval = await db.rpc("approve_liquidation_with_sheet", {
      p_preview: previewId,
    });
    if (approval.error)
      return { ok: false, error: safeDbMessage(approval.error) };
    job = await admin
      .from("sheet_jobs")
      .select("*")
      .eq("id", approval.data)
      .single();
  }
  if (job.error || !job.data)
    return {
      ok: false,
      error: "Could not load the saved Sheets delivery. Refresh and try again.",
    };
  try {
    if (p.data.google_token !== "grokbot.v1")
      throw new Error(
        "Prepare a fresh Grokbot preview before retrying this delivery.",
      );
    const approved = await admin
      .from("liquidations")
      .select("reviewed_at")
      .eq("id", p.data.liquidation_id)
      .single();
    if (approved.error || !approved.data.reviewed_at)
      throw new Error("Could not verify saved custodian approval.");
    const event = grokbotFinancialEvent.parse({
      ...(p.data.requests as Record<string, Json>),
      custodian_approved_at: approved.data.reviewed_at,
    });
    await queueGrokbotOperation({
      id: event.operation_id,
      kind: "liquidation_approved",
      payload: event,
      liquidationId: p.data.liquidation_id,
    });
    const delivery = await admin.from("sheet_jobs").update({
      error: null,
      attempts: job.data.attempts + 1,
      updated_at: new Date().toISOString(),
    }).eq("id", job.data.id).neq("status", "synced");
    if (delivery.error) throw new Error("Could not refresh the queued delivery status.");
    await retryGrokbotOperation(event.operation_id);
    await dispatchGrokbot();
    revalidatePath("/liquidations");
    revalidatePath("/accounting");
    return {
      ok: true,
      status: "pending" as const,
      message:
        "Liquidation approved. Grokbot encoding is queued. The saved report updates after verified completion.",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Delivery unavailable";
    await admin
      .from("sheet_jobs")
      .update({
        status: "pending",
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.data.id)
      .neq("status", "synced");
    revalidatePath("/liquidations");
    return {
      ok: true,
      status: "pending" as const,
      message:
        "Liquidation approved. Grokbot encoding is pending. Review the saved status before retrying.",
    };
  }
}
