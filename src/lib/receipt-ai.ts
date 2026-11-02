import { z } from "zod";

import { MAX_VOUCHER_LINES } from "@/lib/validators/voucher";

export type ScannedLine = {
  particulars: string;
  amount: string;
  category_id: string;
};

export type ScannedReceipt = {
  payee: string;
  voucher_date: string;
  lines: ScannedLine[];
};

const rawSchema = z.object({
  payee: z.string().nullish(),
  date: z.string().nullish(),
  items: z
    .array(
      z.object({
        description: z.string().nullish(),
        amount: z.union([z.number(), z.string()]).nullish(),
        category: z.string().nullish(),
      }),
    )
    .default([]),
  total: z.union([z.number(), z.string()]).nullish(),
});

export function buildScanPrompt(categoryNames: string[], today: string) {
  return [
    "You read photos of Philippine petty cash documents: a filled-in paper petty cash voucher (often handwritten, with signatures), or a store receipt or invoice.",
    "Return ONLY a JSON object with this shape:",
    '{"payee": string|null, "date": "YYYY-MM-DD"|null, "items": [{"description": string, "amount": number, "category": string|null}], "total": number|null}',
    "Rules:",
    '- payee is who received the money: the "Paid to" / "Payee" / "Received by" name on a voucher, or the store or supplier name on a receipt. Never use the signature of an approver or custodian.',
    `- date is the voucher or receipt date as YYYY-MM-DD. Today is ${today}; use it to resolve a missing year. Philippine dates are usually month/day/year. Use null if unreadable.`,
    "- items lists each line of the particulars table with its peso amount (the line total, not the unit price). Combine quantity and description into the description. If only a total is readable, return one item describing the purchase briefly.",
    "- Read handwriting carefully. If an amount or word is unclear, still give your best reading; never invent lines that are not on the page.",
    "- Ignore voucher numbers, signatures, stamps, VAT, change, cash tendered and discount lines unless they are the only amount.",
    `- category must be exactly one of: ${categoryNames.map((name) => JSON.stringify(name)).join(", ")}; use null if none fits. If the form has its own account or category column, match it to the closest option.`,
    "- amount is a plain number with no currency symbol or thousands separators.",
  ].join("\n");
}

// Models sometimes wrap JSON in prose or a <think> block; take the first object.
function extractJson(text: string) {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function toAmount(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const number =
    typeof value === "number"
      ? value
      : Number(value.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number) || number <= 0 || number >= 1e10) return null;
  return (Math.round(number * 100) / 100).toFixed(2);
}

export function parseScan(
  text: string,
  categories: { id: string; name: string }[],
): ScannedReceipt | null {
  const json = extractJson(text);
  const parsed = rawSchema.safeParse(json);
  if (!parsed.success) return null;
  const { payee, date, items, total } = parsed.data;

  const byName = new Map(
    categories.map((category) => [category.name.trim().toLowerCase(), category.id]),
  );

  let lines: ScannedLine[] = [];
  for (const item of items.slice(0, MAX_VOUCHER_LINES)) {
    const amount = toAmount(item.amount);
    const particulars = item.description?.trim().slice(0, 300);
    if (!amount || !particulars) continue;
    lines.push({
      particulars,
      amount,
      category_id: byName.get(item.category?.trim().toLowerCase() ?? "") ?? "",
    });
  }

  if (lines.length === 0) {
    const fallback = toAmount(total);
    if (fallback) {
      lines = [{ particulars: payee?.trim() || "Purchase", amount: fallback, category_id: "" }];
    }
  }

  const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  if (lines.length === 0 && !payee?.trim() && !validDate) return null;

  return {
    payee: payee?.trim().slice(0, 120) ?? "",
    voucher_date: validDate,
    lines,
  };
}
