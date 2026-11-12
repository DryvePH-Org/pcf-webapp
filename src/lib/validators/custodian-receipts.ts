import { z } from "zod";
import { text } from "@/lib/validators/text";
import { isPositiveMoney } from "@/lib/money";

export const custodianReceiptSchema = z
  .object({
    id: z.uuid(),
    particulars: text({ min: 1, max: 300 }),
    amount: z
      .string()
      .refine(isPositiveMoney, "Enter a positive receipt amount."),
    supplier: text({ max: 300 }),
    tin: text({
      max: 100,
      requiredMessage: "Enter the supplier TIN or NON VAT.",
    }),
    tag: text({
      min: 1,
      max: 150,
      requiredMessage: "Choose or enter a workbook tag.",
    }),
    expense_date: z.iso.date("Enter the transaction or liquidation date."),
    plate: text({ max: 300 }),
    receipt_number: text({ max: 100 }),
    // The company the expense is charged to, for sheets that have a COMPANY column (DRYVE).
    company: text({ max: 50 }).default(""),
    receipt_path: z.string().max(300),
    physical_checked: z
      .boolean()
      .refine((value) => value, "Confirm you reviewed this expense."),
  })
  .refine((line) => !line.receipt_path || Boolean(line.supplier && line.tin), {
    message: "Enter the supplier and TIN or NON VAT for attached receipts.",
  });
export const custodianReviewSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  lines: z.array(custodianReceiptSchema).max(40),
});
export type CustodianReceipt = z.infer<typeof custodianReceiptSchema>;
