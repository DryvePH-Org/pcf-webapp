import { z } from "zod";

import { isPositiveMoney } from "@/lib/money";
import { text } from "@/lib/validators/text";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_VOUCHER_LINES = 20;

export const voucherLineSchema = z.object({
  particulars: text({
    max: 300,
    min: 1,
    requiredMessage: "Particulars are required.",
    tooLongMessage: "Keep each line under 300 characters.",
  }),
  amount: z
    .string()
    .trim()
    .refine(isPositiveMoney, "Enter an amount greater than zero."),
  category_id: z.uuid().optional(),
});

export type VoucherLineValues = z.infer<typeof voucherLineSchema>;

export const createVoucherSchema = z.object({
  fund_id: z.uuid("Choose a fund."),
  budget_request_id: z.uuid().optional(),
  number_mode: z.enum(["auto", "manual", "none"]).optional(),
  number_value: text({ max: 30 }).optional(),
  voucher_date: z
    .string()
    .regex(datePattern, "Choose a valid voucher date."),
  payee: text({
    max: 120,
    min: 1,
    requiredMessage: "Payee is required.",
    tooLongMessage: "Keep the payee under 120 characters.",
  }),
  items: z
    .array(voucherLineSchema)
    .min(1, "Add at least one line.")
    .max(MAX_VOUCHER_LINES, `A voucher can have at most ${MAX_VOUCHER_LINES} lines.`),
  no_receipt_reason: text({
    max: 300,
    tooLongMessage: "Keep the reason under 300 characters.",
  }).optional(),
});

export type CreateVoucherValues = z.infer<typeof createVoucherSchema>;

export const updateVoucherSchema = createVoucherSchema
  .omit({ fund_id: true, no_receipt_reason: true, budget_request_id: true })
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
  reason: text({
    max: 300,
    min: 1,
    requiredMessage: "A reason is required.",
    tooLongMessage: "Keep the reason under 300 characters.",
  }),
});

export const ADVANCE_CANCEL_REASONS = {
  plan_changed: "The plan changed",
  not_needed: "It is no longer needed",
  paid_another_way: "It was paid another way",
  other: "Other (explain below)",
} as const;
export type AdvanceCancelReason = keyof typeof ADVANCE_CANCEL_REASONS;

const returnDate = z.string().regex(datePattern, "Choose the date the cash came back.");

export const cancelAdvanceSchema = z
  .object({
    voucher_id: z.uuid(),
    reason: z.enum(["plan_changed", "not_needed", "paid_another_way", "other"], "Choose why the advance was not used."),
    note: text({ max: 300, tooLongMessage: "Keep the note under 300 characters." }),
    cash_back: z.boolean(),
    returned_on: returnDate.optional(),
  })
  .refine((value) => value.reason !== "other" || value.note.length > 0, { path: ["note"], message: "Explain why in the note." })
  .refine((value) => !value.cash_back || Boolean(value.returned_on), { path: ["returned_on"], message: "Choose the date the cash came back." });

export const recordAdvanceReturnSchema = z.object({ voucher_id: z.uuid(), returned_on: returnDate });

export type VoucherReasonValues = z.infer<typeof voucherReasonSchema>;

export const noReceiptReasonSchema = z.object({
  voucher_id: z.uuid(),
  reason: text({
    max: 300,
    min: 1,
    requiredMessage: "Give a short reason for the missing receipt.",
    tooLongMessage: "Keep the reason under 300 characters.",
  }),
});

export type NoReceiptReasonValues = z.infer<typeof noReceiptReasonSchema>;
