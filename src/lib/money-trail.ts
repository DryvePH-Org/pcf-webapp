// Where a fund's money is, in plain steps, and why the app and the Google Sheet can show
// different balances. Everything is worked from the individual vouchers, liquidations and
// settlements (in centavos), so each peso of a difference can be pointed at.
//
//   The app counts a voucher's cash advance as out when it is released, and corrects it only
//   when a settlement (change returned, or a reimbursement paid) is RECORDED.
//   The sheet subtracts only what was actually spent, once a liquidation is approved.
//
// So, with F the fund, S what approved liquidations spent and U advances not yet liquidated:
//   sheet should show        = F - S
//   cash once all is settled = F - S - U
//   cash the app records     = (that) + reimbursements owed - change still to come back
export type TrailVoucher = { id: string; pcv_number: string; payee: string; amount: number };
export type TrailLiquidation = { voucher_id: string; status: string; total_spent: number };
export type TrailSettlement = { voucher_id: string; kind: "return" | "reimbursement"; amount: number };
export type TrailItem = { who: string; ref: string; amount: number };

export type MoneyTrail = {
  fundAmount: number;
  spent: number;
  notLiquidated: TrailItem[];
  notLiquidatedTotal: number;
  owedToEmployees: TrailItem[];
  owedTotal: number;
  changeToCollect: TrailItem[];
  changeTotal: number;
  cashAfterSettlements: number;
  recordedCash: number;
  // Approved liquidations whose sheet update is still waiting or has failed.
  notInSheet: TrailItem[];
  notInSheetTotal: number;
  sheetShouldShow: number;
  sheet: { balance: number | null; syncedAt: string | null } | null;
  // What the sheet last showed minus what it should show; null when it was never read.
  sheetUnexplained: number | null;
  // Recorded cash minus the sheet's balance (the sheet's own, or the expected one).
  difference: number;
  reasons: { sign: 1 | -1; amount: number; text: string }[];
};

const cents = (value: number) => Math.round(value * 100);
const pesos = (value: number) => value / 100;

export function buildMoneyTrail(input: {
  fundAmount: number;
  vouchers: TrailVoucher[];
  liquidations: TrailLiquidation[];
  settlements: TrailSettlement[];
  notInSheetVoucherIds?: string[];
  sheet?: { balance: number | null; syncedAt: string | null } | null;
}): MoneyTrail {
  const liquidationOf = new Map(input.liquidations.map((row) => [row.voucher_id, row]));
  const settlementOf = new Map(input.settlements.map((row) => [row.voucher_id, row]));
  const waiting = new Set(input.notInSheetVoucherIds ?? []);

  let spent = 0;
  const notLiquidated: TrailItem[] = [];
  const owed: TrailItem[] = [];
  const change: TrailItem[] = [];
  const notInSheet: TrailItem[] = [];

  for (const voucher of input.vouchers) {
    const advance = cents(voucher.amount);
    const liquidation = liquidationOf.get(voucher.id);
    const settlement = settlementOf.get(voucher.id);
    const item = (amount: number): TrailItem => ({ who: voucher.payee, ref: voucher.pcv_number, amount: pesos(amount) });
    if (liquidation?.status !== "approved") {
      notLiquidated.push(item(advance));
      continue;
    }
    const actual = cents(liquidation.total_spent);
    spent += actual;
    if (waiting.has(voucher.id)) notInSheet.push(item(actual));
    if (!settlement) {
      const gap = advance - actual;
      if (gap > 0) change.push(item(gap));
      else if (gap < 0) owed.push(item(-gap));
    }
  }

  const sum = (items: TrailItem[]) => items.reduce((total, row) => total + cents(row.amount), 0);
  const fund = cents(input.fundAmount);
  const notLiquidatedTotal = sum(notLiquidated);
  const owedTotal = sum(owed);
  const changeTotal = sum(change);
  const notInSheetTotal = sum(notInSheet);

  const cashAfter = fund - spent - notLiquidatedTotal;
  const recorded = cashAfter + owedTotal - changeTotal;
  const sheetShould = fund - spent;
  const sheetExpected = sheetShould + notInSheetTotal;
  const sheetNow = input.sheet?.balance === null || input.sheet?.balance === undefined ? null : cents(input.sheet.balance);

  const reasons: MoneyTrail["reasons"] = [];
  if (owedTotal > 0)
    reasons.push({ sign: 1, amount: pesos(owedTotal), text: "is owed to employees and not recorded as paid yet. The cash is still in the box, but the sheet already counts it as spent." });
  if (notLiquidatedTotal > 0)
    reasons.push({ sign: -1, amount: pesos(notLiquidatedTotal), text: "was handed out and is not liquidated yet. The app counts it as out; the sheet only records it once the liquidation is approved." });
  if (changeTotal > 0)
    reasons.push({ sign: -1, amount: pesos(changeTotal), text: "is change an employee still has to give back. The sheet only counts what was spent." });
  if (notInSheetTotal > 0)
    reasons.push({ sign: -1, amount: pesos(notInSheetTotal), text: "was approved but is not written to the sheet yet (waiting for Grokbot)." });

  return {
    fundAmount: pesos(fund),
    spent: pesos(spent),
    notLiquidated,
    notLiquidatedTotal: pesos(notLiquidatedTotal),
    owedToEmployees: owed,
    owedTotal: pesos(owedTotal),
    changeToCollect: change,
    changeTotal: pesos(changeTotal),
    cashAfterSettlements: pesos(cashAfter),
    recordedCash: pesos(recorded),
    notInSheet,
    notInSheetTotal: pesos(notInSheetTotal),
    sheetShouldShow: pesos(sheetShould),
    sheet: input.sheet ?? null,
    sheetUnexplained: sheetNow === null ? null : pesos(sheetNow - sheetExpected),
    difference: pesos(recorded - (sheetNow ?? sheetExpected)),
    reasons,
  };
}
