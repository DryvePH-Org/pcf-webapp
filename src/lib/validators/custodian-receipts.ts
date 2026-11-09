import { z } from "zod";
import { text } from "@/lib/validators/text";
import { isPositiveMoney } from "@/lib/money";

export const custodianReceiptSchema = z.object({
  id: z.uuid(),
  particulars: text({ min: 1, max: 300 }),
  amount: z
    .string()
    .refine(isPositiveMoney, "Enter a positive receipt amount."),
  supplier: text({ min: 1, max: 300 }),
  tin: text({
    min: 1,
    max: 100,
    requiredMessage: "Enter the supplier TIN or NON VAT.",
  }),
  tag: text({
    min: 1,
    max: 150,
    requiredMessage: "Choose the exact workbook tag.",
  }),
  expense_date: z.iso.date("Enter the transaction or liquidation date."),
  plate: text({ max: 300 }),
  receipt_number: text({ max: 100 }),
  receipt_path: z.string().min(1, "Choose a receipt picture.").max(300),
  physical_checked: z
    .boolean()
    .refine((value) => value, "Confirm you checked the physical receipt."),
});
export const custodianReviewSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  lines: z.array(custodianReceiptSchema).max(40),
});
export type CustodianReceipt = z.infer<typeof custodianReceiptSchema>;
