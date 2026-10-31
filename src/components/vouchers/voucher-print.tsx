import { formatDate, formatDateTime } from "@/lib/dates";
import { formatPHP } from "@/lib/money";
import { VOUCHER_STATUS_LABELS } from "@/lib/voucher-status";
import type { VoucherStatus } from "@/lib/voucher-status";

export function VoucherPrint({
  pcvNumber,
  fundName,
  voucherDate,
  payee,
  particulars,
  amount,
  categoryName,
  status,
  preparedByName,
  approvedByName,
  approvedAt,
  releasedAt,
  noReceiptReason,
  voidReason,
}: {
  pcvNumber: string;
  fundName: string;
  voucherDate: string;
  payee: string;
  particulars: string;
  amount: string;
  categoryName: string;
  status: VoucherStatus;
  preparedByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
  noReceiptReason: string | null;
  voidReason: string | null;
}) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-2 text-black">
      <div className="border-2 border-black p-6">
        <div className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase">
              Petty Cash Voucher
            </p>
            <h1 className="mt-1 text-xl font-bold">{fundName}</h1>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase">
              PCV No.
            </p>
            <p className="font-mono text-lg font-bold">{pcvNumber}</p>
            <p className="mt-1 text-[10px] uppercase">
              Status: {VOUCHER_STATUS_LABELS[status]}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <Field label="Date" value={formatDate(voucherDate)} />
          <Field label="Payee" value={payee} />
          <Field label="Category" value={categoryName} />
        </div>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-left font-semibold">
                Particulars
              </th>
              <th className="w-44 border border-black px-2 py-1 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="h-24 border border-black px-2 py-2 align-top whitespace-pre-wrap">
                {particulars}
              </td>
              <td className="border border-black px-2 py-2 text-right align-top font-mono">
                {formatPHP(amount)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="border border-black px-2 py-1 text-right font-semibold">
                Total
              </td>
              <td className="border border-black px-2 py-1 text-right font-mono font-bold">
                {formatPHP(amount)}
              </td>
            </tr>
          </tfoot>
        </table>

        {noReceiptReason ? (
          <p className="mt-3 text-xs">
            <span className="font-semibold">No receipt: </span>
            {noReceiptReason}
          </p>
        ) : null}

        {voidReason ? (
          <p className="mt-3 text-xs">
            <span className="font-semibold">Voided: </span>
            {voidReason}
          </p>
        ) : null}

        <div className="mt-10 grid grid-cols-3 gap-8 text-xs">
          <Signature
            label="Prepared by"
            name={preparedByName}
            date={releasedAt ? formatDateTime(releasedAt) : undefined}
          />
          <Signature
            label="Approved by"
            name={approvedByName ?? ""}
            date={approvedAt ? formatDateTime(approvedAt) : undefined}
          />
          <Signature label="Received by" name={payee} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.15em] uppercase">
        {label}
      </p>
      <p className="border-b border-black pb-1 font-medium">{value}</p>
    </div>
  );
}

function Signature({
  label,
  name,
  date,
}: {
  label: string;
  name: string;
  date?: string;
}) {
  return (
    <div className="break-inside-avoid">
      <p className="border-b border-black pb-1 text-center text-[11px] font-medium">
        {name || "\u00a0"}
      </p>
      <p className="mt-1 text-center text-[10px] uppercase">{label}</p>
      {date ? <p className="text-center text-[9px]">{date}</p> : null}
    </div>
  );
}
