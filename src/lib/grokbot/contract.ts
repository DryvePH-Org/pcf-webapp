import { z } from "zod";
import { isPositiveMoney, parseMoney } from "@/lib/money";
import { text } from "@/lib/validators/text";

import { GROKBOT_TARGETS, targetForSpreadsheet } from "./targets";

// The Buying sheet. Kept as its own export because most callers mean exactly this one.
export const GROKBOT_BUYING_TARGET = {
  spreadsheet_id: GROKBOT_TARGETS.buying.spreadsheet_id,
  sheet_id: GROKBOT_TARGETS.buying.sheet_id,
  sheet_title: GROKBOT_TARGETS.buying.sheet_title,
} as const;
const targetObject = (target: { spreadsheet_id: string; sheet_id: number; sheet_title: string }) =>
  z
    .object({
      spreadsheet_id: z.literal(target.spreadsheet_id),
      sheet_id: z.literal(target.sheet_id),
      sheet_title: z.literal(target.sheet_title),
    })
    .strict();
const money = z
  .string()
  .refine(
    isPositiveMoney,
    "Use a positive PHP amount with at most two decimals.",
  );
const nonnegativeMoney = z
  .string()
  .refine((value) => parseMoney(value) !== null);
const approvalTimestamp = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
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
    // Only sheets with a COMPANY column use it (DRYVE); it is checked against that sheet's list below.
    company: text({ max: 50 }).optional(),
  })
  .strict();
const common = {
  protocol_version: z.literal("pcf.grokbot.v1"),
  operation_id: z.uuid(),
  // Only the allowed sheets (see targets.ts) can be named.
  target: z.union([targetObject(GROKBOT_TARGETS.buying), targetObject(GROKBOT_TARGETS.dryve)]),
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
        custodian_approved_at: approvalTimestamp,
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
        accounting_approved_at: approvalTimestamp,
        approver_approved_at: approvalTimestamp,
        accounting_id: z.uuid(),
        approver_id: z.uuid(),
        custodian_name: text({ min: 1, max: 100 }),
        approval_date: z.iso.date(),
      })
      .strict(),
  ])
  .superRefine((event, context) => {
    if (event.event === "pcf.liquidation.approved") {
      const companies = targetForSpreadsheet(event.target.spreadsheet_id, event.target.sheet_id)?.layout.companies ?? [];
      for (const item of event.lines) {
        const company = item.company?.trim().toUpperCase() ?? "";
        if (companies.length ? !companies.includes(company) : company !== "")
          context.addIssue({
            code: "custom",
            message: companies.length
              ? `Choose a company for every expense (${companies.join(" or ")}).`
              : "This sheet has no company column.",
          });
      }
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
