import { formatDate } from "@/lib/dates";
import { formatPHP } from "@/lib/money";

export type PrintLine = { position: number; particulars: string; amount: number; receipt: string };

type Props = {
  pcv: string;
  fund: string;
  statusLabel: string;
  name: string;
  department: string;
  filingDate: string;
  advance: number;
  spent: number;
  settlementLabel: string;
  settlementAmount: string;
  lines: PrintLine[];
  unspentReason: string | null;
  filedBy: string | null;
  reviewedLine: string | null;
  settlementNote: string | null;
};

const SIGNATORIES: { role: string; caption: string }[] = [
  { role: "Filed by", caption: "Employee's printed name and signature" },
  { role: "Noted by", caption: "Immediate supervisor's name and signature" },
  { role: "Checked by", caption: "Finance Personnel" },
  { role: "Approved by", caption: "Managing Partners" },
];

// A one-page paper copy: the numbers first, the expenses in a tight table, then who signs.
export function LiquidationPrintSheet(p: Props) {
  return (
    <section className="hidden break-inside-avoid text-[11px] leading-snug text-black print:block">
      <header className="flex items-end justify-between border-b-2 border-black pb-1.5">
        <div>
          <h1 className="text-base font-bold uppercase tracking-wide">Liquidation / Reimbursement Form</h1>
          <p className="text-xs">{p.fund}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-bold">{p.pcv}</p>
          <p className="text-[10px] uppercase">{p.statusLabel}</p>
        </div>
      </header>

      <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1">
        <Info label="Name" value={p.name} />
        <Info label="Department" value={p.department || "—"} />
        <Info label="Filing date" value={formatDate(p.filingDate)} />
      </dl>

      <table className="mt-2 w-full border-collapse border border-black text-[11px]">
        <thead>
          <tr className="bg-neutral-200 text-left text-[10px] uppercase">
            <th className="w-7 border border-black px-1.5 py-1">#</th>
            <th className="border border-black px-1.5 py-1">Particulars</th>
            <th className="w-36 border border-black px-1.5 py-1">Receipt</th>
            <th className="w-24 border border-black px-1.5 py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {p.lines.length === 0 ? (
            <tr><td colSpan={4} className="border border-black px-1.5 py-1.5">No expenses listed. {p.unspentReason ?? "The advance was not spent."}</td></tr>
          ) : p.lines.map(line => (
            <tr key={line.position} className="break-inside-avoid align-top">
              <td className="border border-black px-1.5 py-1">{line.position}</td>
              <td className="border border-black px-1.5 py-1">{line.particulars}</td>
              <td className="border border-black px-1.5 py-1">{line.receipt}</td>
              <td className="border border-black px-1.5 py-1 text-right tabular-nums">{formatPHP(line.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={3} className="border border-black px-1.5 py-1 text-right uppercase">Total spent</td>
            <td className="border border-black px-1.5 py-1 text-right tabular-nums">{formatPHP(p.spent)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-2 grid grid-cols-3 border border-black text-center">
        <Figure label="Cash received" value={formatPHP(p.advance)} />
        <Figure label="Actually spent" value={formatPHP(p.spent)} />
        <Figure label={p.settlementLabel} value={p.settlementAmount} strong />
      </div>
      {p.unspentReason && p.lines.length > 0 ? <p className="mt-1.5"><b>Why not spent:</b> {p.unspentReason}</p> : null}
      {p.settlementNote ? <p className="mt-1.5">{p.settlementNote}</p> : null}
      {p.filedBy ? <p className="mt-1.5"><b>Prepared by:</b> {p.filedBy}, on behalf of the employee</p> : null}
      {p.reviewedLine ? <p className="mt-1.5"><b>Custodian review:</b> {p.reviewedLine}</p> : null}

      <div className="mt-5 grid break-inside-avoid grid-cols-2 gap-x-12 gap-y-7">
        {SIGNATORIES.map(s => (
          <div key={s.role}>
            <p className="font-semibold">{s.role}:</p>
            <div className="mt-7 border-b border-black" />
            <p className="mt-0.5 text-[10px]">{s.caption}</p>
          </div>
        ))}
        <div>
          <p className="font-semibold">Received by:</p>
          <div className="mt-7 border-b border-black" />
          <p className="mt-2 flex items-end gap-1 font-semibold">Received date:<span className="inline-block flex-1 border-b border-black" /></p>
        </div>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] uppercase">{label}</dt><dd className="border-b border-neutral-400 font-semibold">{value}</dd></div>;
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="border-r border-black px-2 py-1.5 last:border-r-0">
      <p className="text-[10px] uppercase">{label}</p>
      <p className={`tabular-nums ${strong ? "text-base font-bold" : "text-sm font-semibold"}`}>{value}</p>
    </div>
  );
}
