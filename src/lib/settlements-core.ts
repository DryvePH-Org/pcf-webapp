// Cash settlements still to be done: money to take back from an employee, money to pay an
// employee, or the cash of a cancelled advance that has not been recorded as returned.
export type SettlementKind = "return" | "reimbursement" | "cancelled";

export type SettlementItem = {
  key: string;
  kind: SettlementKind;
  who: string;
  ref: string;
  fund: string;
  amount: number;
  since: string | null;
  href: string;
  // False when someone else has to record it (for example a custodian's own advance).
  canAct: boolean;
};

export type ApprovedLiquidation = {
  id: string;
  pcv_number: string;
  employee_name: string;
  fund_name: string;
  amount_received: number;
  total_spent: number;
  reviewed_at: string | null;
  owner_id: string;
  fund_id: string;
};
export type CancelledAdvance = { voucher_id: string; pcv_number: string; payee: string; fund_name: string; amount: number; cancelled_at: string; canAct: boolean };

const cents = (value: number) => Math.round(value * 100);

export function buildSettlementItems(input: {
  liquidations: ApprovedLiquidation[];
  settledLiquidationIds: string[];
  cancelled: CancelledAdvance[];
  canActOn: (liquidation: ApprovedLiquidation) => boolean;
}): SettlementItem[] {
  const settled = new Set(input.settledLiquidationIds);
  const items: SettlementItem[] = [];
  for (const row of input.liquidations) {
    if (settled.has(row.id)) continue;
    const diff = cents(row.amount_received) - cents(row.total_spent);
    if (diff === 0) continue;
    items.push({
      key: `l-${row.id}`,
      kind: diff > 0 ? "return" : "reimbursement",
      who: row.employee_name,
      ref: row.pcv_number,
      fund: row.fund_name,
      amount: Math.abs(diff) / 100,
      since: row.reviewed_at,
      href: `/liquidations/${row.id}`,
      canAct: input.canActOn(row),
    });
  }
  for (const row of input.cancelled) {
    items.push({
      key: `c-${row.voucher_id}`,
      kind: "cancelled",
      who: row.payee,
      ref: row.pcv_number,
      fund: row.fund_name,
      amount: row.amount,
      since: row.cancelled_at,
      href: `/vouchers/${row.voucher_id}`,
      canAct: row.canAct,
    });
  }
  // The longest waiting first.
  return items.sort((a, b) => (a.since ?? "").localeCompare(b.since ?? "") || a.key.localeCompare(b.key));
}

// The sentence a custodian reads: what to do, with whom.
export function settlementAction(item: Pick<SettlementItem, "kind" | "who">) {
  if (item.kind === "reimbursement") return `Pay ${item.who} the reimbursement`;
  if (item.kind === "return") return `Take the change back from ${item.who}`;
  return `Take the unused advance back from ${item.who}`;
}

export function settlementTotals(items: SettlementItem[]) {
  const sum = (kinds: SettlementKind[]) => items.filter((item) => kinds.includes(item.kind)).reduce((total, item) => total + cents(item.amount), 0) / 100;
  return { toCollect: sum(["return", "cancelled"]), toPay: sum(["reimbursement"]) };
}
