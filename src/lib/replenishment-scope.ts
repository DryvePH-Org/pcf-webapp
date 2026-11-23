import { formatDate } from "@/lib/dates";
import { formatPHP } from "@/lib/money";

// What a replenishment report covers, in plain words, so nobody mistakes it for everything in the ledger: it holds
// only the vouchers bundled into it when it was prepared. Later expenses count toward the next replenishment, and the
// Google Sheet and the Accounting page, which count everything, can therefore show more.
export type ScopeInput = {
  voucherCount: number;
  entryCount: number;
  firstPcv: string | null;
  lastPcv: string | null;
  firstDate: string | null;
  lastDate: string | null;
  preparedOn: string;
  total: string;
  // expenses of the same fund approved after this was prepared and not part of any replenishment yet
  later: { count: number; amount: string } | null;
};
export type Scope = { covers: string; total: string; later: string | null; note: string };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function describeScope(input: ScopeInput): Scope {
  const range =
    input.firstPcv && input.lastPcv && input.firstPcv !== input.lastPcv ? `${input.firstPcv} to ${input.lastPcv}` : (input.firstPcv ?? "");
  const dates =
    input.firstDate && input.lastDate && input.firstDate !== input.lastDate
      ? `dated ${formatDate(input.firstDate)} to ${formatDate(input.lastDate)}`
      : input.firstDate
        ? `dated ${formatDate(input.firstDate)}`
        : "";
  const covers = [
    `This report covers the ${plural(input.entryCount, "expense")} on ${plural(input.voucherCount, "voucher")}`,
    range ? `(${range}${dates ? `, ${dates}` : ""})` : dates ? `(${dates})` : "",
    `that were bundled into it when it was prepared on ${formatDate(input.preparedOn)}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    covers,
    total: `${formatPHP(input.total)} is the amount this replenishment replaces.`,
    later: input.later && input.later.count > 0
      ? `Expenses recorded after that are not in this report: ${plural(input.later.count, "liquidation")} totalling ${formatPHP(input.later.amount)} so far. They count toward the next replenishment.`
      : null,
    note: "The Google Sheet and the Accounting page count everything on the ledger, so their totals can be higher than this report.",
  };
}
