import { parseMoney } from "@/lib/money";
export const LIQUIDATION_STATUSES = ["draft", "submitted", "flagged", "approved"] as const;
export const LIQUIDATION_LABELS: Record<string, string> = { draft: "Draft — not submitted", submitted: "Awaiting custodian review", flagged: "Needs correction", approved: "Approved" };
export function liquidationDifference(received: string, spent: string) {
  const advance = parseMoney(received);
  const expenses = parseMoney(spent);
  if (advance === null || expenses === null) throw new Error("Invalid liquidation amounts");
  const centavos = advance - expenses;
  return { centavos, amount: (Math.abs(centavos) / 100).toFixed(2), kind: centavos > 0 ? "return" : centavos < 0 ? "reimbursement" : "none" } as const;
}
