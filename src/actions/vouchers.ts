"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { toMoneyNumber } from "@/lib/money";
import {
  notifyLowBalance,
  notifyVoucherApproved,
  notifyVoucherFlagged,
  notifyVoucherReleased,
  notifyVoucherVoided,
} from "@/lib/notifications/events";
import { queueNotification } from "@/lib/notifications/deliver";
import { createClient } from "@/lib/supabase/server";
import {
  createVoucherSchema,
  noReceiptReasonSchema,
  receiptPathSchema,
  voucherReasonSchema,
  type CreateVoucherValues,
} from "@/lib/validators/voucher";

export type CreateVoucherResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

function validationError(input: z.ZodError): ActionResult {
  const fieldErrors = z.flattenError(input).fieldErrors as Record<
    string,
    string[]
  >;
  return actionError("Check the highlighted fields.", fieldErrors);
}

function createVoucherError(
  error: string,
  fieldErrors?: Record<string, string[]>,
): CreateVoucherResult {
  return { ok: false, error, fieldErrors };
}

function createVoucherValidationError(input: z.ZodError): CreateVoucherResult {
  const fieldErrors = z.flattenError(input).fieldErrors as Record<
    string,
    string[]
  >;
  return createVoucherError("Check the highlighted fields.", fieldErrors);
}

async function fundIsLow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fundId: string,
) {
  const { data } = await supabase
    .from("fund_balance_v")
    .select("is_low")
    .eq("fund_id", fundId)
    .maybeSingle();
  return Boolean(data?.is_low);
}

function revalidateVoucher(id: string) {
  revalidatePath("/vouchers");
  revalidatePath(`/vouchers/${id}`);
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
}

export async function createVoucher(
  input: CreateVoucherValues,
): Promise<CreateVoucherResult> {
  const user = await getCurrentUser();
  if (!user) return createVoucherError("Sign in to create a voucher.");

  const parsed = createVoucherSchema.safeParse(input);
  if (!parsed.success) return createVoucherValidationError(parsed.error);

  const values = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_voucher", {
    p_fund_id: values.fund_id,
    p_payee: values.payee,
    p_particulars: values.particulars,
    p_amount: toMoneyNumber(values.amount),
    p_category_id: values.category_id,
    p_voucher_date: values.voucher_date,
    p_no_receipt_reason: values.no_receipt_reason?.trim() || undefined,
  });

  if (error) return createVoucherError(error.message);

  revalidatePath("/vouchers");
  return { ok: true, id: data as string };
}

export async function setVoucherReceipt(
  input: z.input<typeof receiptPathSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to attach a receipt.");

  const parsed = receiptPathSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const { voucher_id, receipt_path } = parsed.data;
  const supabase = await createClient();

  const { data: voucher, error: readError } = await supabase
    .from("vouchers")
    .select("id, fund_id, status, prepared_by")
    .eq("id", voucher_id)
    .maybeSingle();

  if (readError) return actionError(readError.message);
  if (!voucher) return actionError("Voucher not found.");
  if (voucher.status !== "draft") {
    return actionError("Only drafts can take a new receipt.");
  }
  if (voucher.prepared_by !== user.id) {
    return actionError("Only the person who prepared this voucher can attach its receipt.");
  }
  if (!receipt_path.startsWith(`${voucher.fund_id}/${voucher.id}/`)) {
    return actionError("The receipt path does not match this voucher.");
  }

  const { data: updated, error } = await supabase
    .from("vouchers")
    .update({ receipt_path, no_receipt_reason: null })
    .eq("id", voucher_id)
    .select("id");

  if (error) return actionError(error.message);
  if (!updated || updated.length === 0) {
    return actionError("Could not attach the receipt to this voucher.");
  }

  revalidateVoucher(voucher_id);
  return { ok: true };
}

export async function setNoReceiptReason(
  input: z.input<typeof noReceiptReasonSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to update this voucher.");

  const parsed = noReceiptReasonSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const { voucher_id, reason } = parsed.data;
  const supabase = await createClient();

  const { data: voucher, error: readError } = await supabase
    .from("vouchers")
    .select("id, status, prepared_by")
    .eq("id", voucher_id)
    .maybeSingle();

  if (readError) return actionError(readError.message);
  if (!voucher) return actionError("Voucher not found.");
  if (voucher.status !== "draft") {
    return actionError("Only drafts can take a new no-receipt reason.");
  }
  if (voucher.prepared_by !== user.id) {
    return actionError("Only the person who prepared this voucher can update it.");
  }

  const { data: updated, error } = await supabase
    .from("vouchers")
    .update({ no_receipt_reason: reason })
    .eq("id", voucher_id)
    .select("id");

  if (error) return actionError(error.message);
  if (!updated || updated.length === 0) {
    return actionError("Could not update this voucher.");
  }

  revalidateVoucher(voucher_id);
  return { ok: true };
}

export async function releaseVoucher(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to release cash.");

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("vouchers")
    .select("fund_id")
    .eq("id", id)
    .maybeSingle();
  const wasLow = before ? await fundIsLow(supabase, before.fund_id) : true;

  const { error } = await supabase.rpc("release_voucher", { p_id: id });
  if (error) return actionError(error.message);

  const nowLow = before ? await fundIsLow(supabase, before.fund_id) : false;
  queueNotification("voucher.released", () => notifyVoucherReleased(id, user.id));
  if (before && nowLow && !wasLow) {
    const fundId = before.fund_id;
    queueNotification("fund.low_balance", () => notifyLowBalance(fundId));
  }

  revalidateVoucher(id);
  return { ok: true };
}

export async function approveVoucher(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to review vouchers.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_voucher", { p_id: id });
  if (error) return actionError(error.message);

  queueNotification("voucher.approved", () => notifyVoucherApproved(id, user.id));
  revalidateVoucher(id);
  return { ok: true };
}

export async function flagVoucher(
  input: z.input<typeof voucherReasonSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to review vouchers.");

  const parsed = voucherReasonSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_voucher", {
    p_id: parsed.data.voucher_id,
    p_reason: parsed.data.reason,
  });
  if (error) return actionError(error.message);

  const flaggedId = parsed.data.voucher_id;
  queueNotification("voucher.flagged", () => notifyVoucherFlagged(flaggedId, user.id));
  revalidateVoucher(parsed.data.voucher_id);
  return { ok: true };
}

export async function voidVoucher(
  input: z.input<typeof voucherReasonSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to void vouchers.");

  const parsed = voucherReasonSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_voucher", {
    p_id: parsed.data.voucher_id,
    p_reason: parsed.data.reason,
  });
  if (error) return actionError(error.message);

  const voidedId = parsed.data.voucher_id;
  queueNotification("voucher.voided", () => notifyVoucherVoided(voidedId, user.id));
  revalidateVoucher(parsed.data.voucher_id);
  return { ok: true };
}
