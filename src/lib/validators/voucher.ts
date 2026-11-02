import { z } from "zod";

import { isPositiveMoney } from "@/lib/money";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_VOUCHER_LINES = 20;

export const voucherLineSchema = z.object({
  particulars: z
    .string()
    .trim()
    .min(1, "Particulars are required.")
    .max(300, "Keep each line under 300 characters."),
  amount: z
    .string()
    .trim()
    .refine(isPositiveMoney, "Enter an amount greater than zero."),
  category_id: z.uuid("Choose a category."),
});

export type VoucherLineValues = z.infer<typeof voucherLineSchema>;

export const createVoucherSchema = z.object({
  fund_id: z.uuid("Choose a fund."),
  voucher_date: z
    .string()
    .regex(datePattern, "Choose a valid voucher date."),
  payee: z
    .string()
    .trim()
    .min(1, "Payee is required.")
    .max(120, "Keep the payee under 120 characters."),
  items: z
    .array(voucherLineSchema)
    .min(1, "Add at least one line.")
    .max(MAX_VOUCHER_LINES, `A voucher can have at most ${MAX_VOUCHER_LINES} lines.`),
  no_receipt_reason: z
    .string()
    .trim()
    .max(300, "Keep the reason under 300 characters.")
    .optional(),
});

export type CreateVoucherValues = z.infer<typeof createVoucherSchema>;

export const updateVoucherSchema = createVoucherSchema
  .omit({ fund_id: true, no_receipt_reason: true })
  .extend({ voucher_id: z.uuid() });

export type UpdateVoucherValues = z.infer<typeof updateVoucherSchema>;

export const receiptPathSchema = z.object({
  voucher_id: z.uuid(),
  receipt_path: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .regex(/^[\w-]+\/[\w-]+\/[\w.-]+\.(jpg|jpeg|png|webp)$/i),
});

export type ReceiptPathValues = z.infer<typeof receiptPathSchema>;

export const voucherReasonSchema = z.object({
  voucher_id: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required.")
    .max(300, "Keep the reason under 300 characters."),
});

export type VoucherReasonValues = z.infer<typeof voucherReasonSchema>;

export const noReceiptReasonSchema = z.object({
  voucher_id: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "Give a short reason for the missing receipt.")
    .max(300, "Keep the reason under 300 characters."),
});

export type NoReceiptReasonValues = z.infer<typeof noReceiptReasonSchema>;
