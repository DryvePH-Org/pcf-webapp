import { z } from "zod";
import { isPositiveMoney } from "@/lib/money";
import { personName, text } from "@/lib/validators/text";

export const createBudgetRequestSchema = z.object({
  fund_id: z.uuid("Choose a fund."),
  requester_name: personName(100),
  amount: z.string().trim().refine(isPositiveMoney, "Enter a budget greater than zero with at most two decimals."),
  purpose: text({ min: 1, max: 300, requiredMessage: "Explain the purpose of this budget." }),
});
export const reviewBudgetRequestSchema = z.object({
  id: z.uuid(),
  approve: z.boolean(),
  note: text({ max: 300 }).default(""),
}).refine(value => value.approve || Boolean(value.note), { path: ["note"], message: "A rejection reason is required." });
export type CreateBudgetRequestValues = z.infer<typeof createBudgetRequestSchema>;
