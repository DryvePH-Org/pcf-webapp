"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/database.types";
import {
  sheetsAdmin,
  sheetsBridge,
  type ReadResult,
} from "@/lib/sheets/bridge";
import {
  planExpenses,
  sheetExpenseTags,
  type ExpenseForSheet,
} from "@/lib/sheets/planner";
import type { SheetsDatabase, Cell, SheetTab } from "@/lib/sheets/types";
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
    if (existing.data) {
      const status = await sheetsBridge<{ receipt: Json | null }>({
        action: "status",
        book: w.data.id,
        operationId: existing.data.operation_id,
      });
      if (status.receipt) {
        await admin
          .from("sheet_jobs")
          .update({ status: "synced", report: status.receipt, error: null })
          .eq("id", existing.data.id);
        return {
          ok: false as const,
          error:
            "Google already applied this update. Refresh to view the saved report.",
        };
      }
      const original = await admin
        .from("sheet_previews")
        .select("sheet_id")
        .eq("id", existing.data.preview_id)
        .single();
      if (original.error || original.data.sheet_id !== w.data.active_sheet_id)
        throw new Error(
          "The original destination worksheet changed. Ask an administrator to resolve the pending update before retrying.",
        );
    }
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
        "Complete the pending replenishment worksheet before synchronizing more expenses.",
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
    const rows: Cell[][] = [];
    let cursor: number | null = 0;
    if (expenses.length) {
      while (cursor !== null) {
        const response: ReadResult = await sheetsBridge<ReadResult>({
          action: "read",
          book: w.data.id,
          sheetId: w.data.active_sheet_id,
          startRow: cursor,
          limit: 500,
        });
        for (const sheet of response.snapshot.data.sheets ?? [])
          for (const block of sheet.data ?? [])
            for (const [i, row] of (block.rowData ?? []).entries())
              rows[(block.startRow ?? cursor) + i] = row.values ?? [];
        const next: number | null = response.snapshot.nextRow;
        if (next !== null && next <= cursor)
          throw new Error("Invalid Google pagination.");
        cursor = next;
      }
    }
    const grid = Array.from({ length: rows.length }, (_, i) => rows[i] ?? []);
    const requests = planExpenses(w.data.active_sheet_id, grid, expenses);
    const formulaTags = sheetExpenseTags(grid);
    const customTags = expenses.filter(
      (expense) =>
        formulaTags.length && !formulaTags.includes(expense.category),
    );
    const operation =
      existing.data?.operation_id ?? `liquidation_${id.replaceAll("-", "")}`;
    let google: {
      preview: { token?: string; alreadyApplied?: boolean; report?: Json };
    } = { preview: { token: "no-expenses" } };
    if (requests.length)
      google = await sheetsBridge({
        action: "preview",
        book: w.data.id,
        operationId: operation,
        requests,
      });
    if (google.preview.alreadyApplied && existing.data) {
      await admin
        .from("sheet_jobs")
        .update({
          status: "synced",
          report: google.preview.report ?? null,
          error: null,
        })
        .eq("id", existing.data.id);
      return {
        ok: false as const,
        error: "This update was already delivered. Refresh to view its report.",
      };
    }
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
      requests: requests as Json,
      google_token: google.preview.token!,
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
    return { ok: true, message: "Already delivered. View the saved report." };
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
    if (p.data.google_token === "needs-preview")
      throw new Error(
        "Google Sheets update is pending a fresh preview. Review and retry when the connection is available.",
      );
    await admin
      .from("sheet_jobs")
      .update({ attempts: job.data.attempts + 1 })
      .eq("id", job.data.id);
    const response =
      p.data.google_token === "no-expenses"
        ? {
            report: {
              message: "No expense rows; no Google write required.",
              completedAt: new Date().toISOString(),
            },
          }
        : await sheetsBridge<{ report: Json }>({
            action: "commit",
            book: p.data.book_id,
            operationId: p.data.operation_id,
            token: p.data.google_token,
            requests: p.data.requests,
          });
    const saved = await admin
      .from("sheet_jobs")
      .update({
        status: "synced",
        report: response.report,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.data.id);
    if (saved.error)
      throw new Error(
        "Google delivery completed; report needs reconciliation.",
      );
    revalidatePath("/liquidations");
    revalidatePath("/accounting");
    return {
      ok: true,
      message:
        "Liquidation approved and Google Sheets updated. View the saved update report.",
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
      message:
        "Liquidation approved — sheet update pending. Review and retry the sheet update.",
    };
  }
}
