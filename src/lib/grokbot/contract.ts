import { z } from "zod";
import { isPositiveMoney, parseMoney } from "@/lib/money";
import { text } from "@/lib/validators/text";

export const GROKBOT_BUYING_TARGET = {
  spreadsheet_id: "1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk",
  sheet_id: 1042918180,
  sheet_title: "PCF REPLENISHMENT - BUYING (NOV-DEC 2026)",
} as const;
const money = z
  .string()
  .refine(
    isPositiveMoney,
    "Use a positive PHP amount with at most two decimals.",
  );
const nonnegativeMoney = z
  .string()
  .refine((value) => parseMoney(value) !== null);
const line = z
  .object({
    entry_id: z.uuid(),
    particulars: text({ min: 1, max: 300 }),
    amount: money,
    tag: text({ min: 1, max: 150 }),
    expense_date: z.iso.date(),
    supplier: text({ max: 300 }),
    tin: text({ max: 100 }),
    receipt_number: text({ max: 100 }),
    plate: text({ max: 300 }),
  })
  .strict();
const common = {
  protocol_version: z.literal("pcf.grokbot.v1"),
  operation_id: z.uuid(),
  target: z
    .object({
      spreadsheet_id: z.literal(GROKBOT_BUYING_TARGET.spreadsheet_id),
      sheet_id: z.literal(GROKBOT_BUYING_TARGET.sheet_id),
      sheet_title: z.literal(GROKBOT_BUYING_TARGET.sheet_title),
    })
    .strict(),
};
export const grokbotFinancialEvent = z
  .discriminatedUnion("event", [
    z
      .object({
        ...common,
        event: z.literal("pcf.liquidation.approved"),
        liquidation_id: z.uuid(),
        voucher_id: z.uuid(),
        voucher_number: text({ max: 100 }),
        requester_name: text({ min: 1, max: 100 }),
        department: text({ max: 100 }),
        filing_date: z.iso.date(),
        custodian_approved_at: z.iso.datetime(),
        custodian_id: z.uuid(),
        amount_received: money,
        total_spent: nonnegativeMoney,
        return_amount: nonnegativeMoney,
        reimbursement_amount: nonnegativeMoney,
        lines: z.array(line).max(40),
      })
      .strict(),
    z
      .object({
        ...common,
        event: z.literal("pcf.replenishment.approved"),
        replenishment_id: z.uuid(),
        replenishment_number: z.number().int().positive(),
        expected_previous_replenishment_number: z.number().int().nonnegative(),
        approved_amount: money,
        accounting_approved_at: z.iso.datetime(),
        approver_approved_at: z.iso.datetime(),
        accounting_id: z.uuid(),
        approver_id: z.uuid(),
        custodian_name: text({ min: 1, max: 100 }),
        approval_date: z.iso.date(),
      })
      .strict(),
  ])
  .superRefine((event, context) => {
    if (event.event === "pcf.liquidation.approved") {
      const total = event.lines.reduce(
        (sum, item) => sum + (parseMoney(item.amount) ?? 0),
        0,
      );
      const received = parseMoney(event.amount_received) ?? 0;
      if (total !== parseMoney(event.total_spent))
        context.addIssue({
          code: "custom",
          message: "Expense lines must match actual spending.",
        });
      if (
        parseMoney(event.return_amount) !== Math.max(received - total, 0) ||
        parseMoney(event.reimbursement_amount) !== Math.max(total - received, 0)
      )
        context.addIssue({
          code: "custom",
          message: "Return and reimbursement amounts do not reconcile.",
        });
      if (
        new Set(event.lines.map((item) => item.entry_id)).size !==
        event.lines.length
      )
        context.addIssue({
          code: "custom",
          message: "Expense entry IDs must be unique.",
        });
    } else {
      if (
        event.replenishment_number !==
        event.expected_previous_replenishment_number + 1
      )
        context.addIssue({
          code: "custom",
          message:
            "Replenishment number must continue the target-tab sequence.",
        });
      if (event.accounting_id === event.approver_id)
        context.addIssue({
          code: "custom",
          message: "The accounting reviewer and approver must be independent.",
        });
    }
  });
