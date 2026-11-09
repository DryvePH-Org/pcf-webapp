import { z } from "zod";
import { isPositiveMoney, parseMoney } from "@/lib/money";
import { text } from "@/lib/validators/text";

export const liquidationLineSchema = z.object({
  id: z.uuid(),
  sheet_details: z.object({company:text({max:100}).optional(),sheet_category:text({max:150}).optional(),expense_date:z.iso.date().or(z.literal('')).optional(),supplier:text({max:300}).optional(),receipt_number:text({max:300}).optional(),plate:text({max:300}).optional(),tin:text({max:300}).optional(),address:text({max:300}).optional()}).optional(),
  particulars: text({ min: 1, max: 300 }),
  amount: z.string().trim().refine(isPositiveMoney, "Enter a positive amount with at most two decimals."),
  category_id: z.uuid().optional(),
  receipt_path: z.string().max(300).default(""),
  no_receipt_reason: text({ max: 300 }).default(""),
});
export const saveLiquidationSchema = z.object({
  id: z.uuid(),
  department: text({ min: 1, max: 100, requiredMessage: "Department is required." }),
  filing_date: z.iso.date("Choose a valid filing date."),
  items: z.array(liquidationLineSchema).max(20),
  unspent_reason: text({ max: 300 }).default(""),
}).refine(value => value.items.reduce((sum, item) => sum + (parseMoney(item.amount) ?? 0), 0) <= 999999999999, { message: "The total is too large.", path: ["items"] });
export const submitLiquidationSchema = saveLiquidationSchema
  .refine(value => value.items.every(item => Boolean(item.receipt_path) && /\.(jpg|jpeg|png|webp)$/i.test(item.receipt_path)), { message: "Upload a receipt picture for every expense line.", path: ["items"] })
  .refine(value => value.items.length > 0 || Boolean(value.unspent_reason), { message: "Explain why the advance was not spent.", path: ["unspent_reason"] });
export const liquidationReviewSchema = z.object({ id: z.uuid(), approve: z.boolean(), note: text({ max: 300 }).default("") })
  .refine(value => value.approve || Boolean(value.note), { message: "A reason is required when flagging liquidation.", path: ["note"] });
export const settlementSchema = z.object({ id: z.uuid(), amount: z.string().refine(isPositiveMoney, "Enter the exact amount due."), note: text({ max: 300 }).default("") });
export type LiquidationFormValues = z.infer<typeof saveLiquidationSchema>;
export type LiquidationLine = z.infer<typeof liquidationLineSchema>;
