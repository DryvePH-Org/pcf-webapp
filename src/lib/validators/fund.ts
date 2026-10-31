import { isPositiveMoney, parseMoney } from "@/lib/money";
import { z } from "zod";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const moneyField = z
  .string()
  .trim()
  .regex(
    /^\d{1,10}(?:\.\d{1,2})?$/,
    "Enter an amount with up to 2 decimals",
  )
  .refine(isPositiveMoney, "Amount must be greater than 0");

export const fundFormSchema = z
  .object({
    name: z.string().trim().min(1, "Fund name is required").max(80),
    amount: moneyField,
    per_txn_limit: moneyField,
    low_balance_pct: z
      .number({ error: "Enter a whole number" })
      .int("Enter a whole number")
      .min(1, "Use 1 to 100")
      .max(100, "Use 1 to 100"),
    custodian_id: z
      .string()
      .trim()
      .refine(
        (value) => value === "none" || uuidPattern.test(value),
        "Select a valid custodian",
      ),
  })
  .superRefine((value, context) => {
    const limit = parseMoney(value.per_txn_limit);
    const amount = parseMoney(value.amount);
    if (limit !== null && amount !== null && limit > amount) {
      context.addIssue({
        code: "custom",
        path: ["per_txn_limit"],
        message: "Per-transaction limit cannot exceed the fund amount",
      });
    }
  });

export const saveFundSchema = fundFormSchema.extend({
  id: z.string().regex(uuidPattern).optional(),
  confirmAmountChange: z.boolean().optional(),
});

export type FundFormValues = z.infer<typeof fundFormSchema>;
export type SaveFundInput = z.infer<typeof saveFundSchema>;
