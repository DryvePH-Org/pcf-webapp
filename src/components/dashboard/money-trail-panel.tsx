import { MoneyText } from "@/components/shared/money-text";
import { formatDateTime } from "@/lib/dates";
import type { MoneyTrail, TrailItem } from "@/lib/money-trail";
import { cn } from "@/lib/utils";

function Step({
  sign,
  label,
  amount,
  note,
  items,
  strong,
}: {
  sign: "+" | "−" | "=" | "";
  label: string;
  amount: number;
  note?: string;
  items?: TrailItem[];
  strong?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-2 py-1.5", strong && "rounded-md bg-primary/5 px-2 font-semibold")}>
      <span className="text-muted-foreground">{sign}</span>
      <div className="min-w-0">
        <p>{label}</p>
        {note ? <p className="text-xs font-normal text-muted-foreground">{note}</p> : null}
        {items?.length ? (
          <ul className="mt-0.5 space-y-0.5 text-xs font-normal text-muted-foreground">
            {items.map((item) => (
              <li key={`${item.ref}-${item.amount}`}>
                {item.who} · {item.ref} · <MoneyText value={item.amount} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <MoneyText value={amount} className="text-right tabular-nums" />
    </div>
  );
}

// Where the fund's money is, step by step, and why the app and the Google Sheet differ.
export function MoneyTrailPanel({ trail }: { trail: MoneyTrail }) {
  const sheetNow = trail.sheet?.balance ?? null;
  const expectedSheet = trail.sheetShouldShow + trail.notInSheetTotal;
  const compared = sheetNow ?? expectedSheet;

  return (
    <details open className="rounded-lg border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Where is the money?</summary>
      <div className="space-y-4 border-t p-3 text-sm">
        <div className="divide-y">
          <Step sign="" label="Fund amount" amount={trail.fundAmount} />
          <Step sign="−" label="Spent so far (approved liquidations)" amount={trail.spent} note="This is what the Google Sheet records." />
          {trail.notLiquidatedTotal > 0 ? (
            <Step
              sign="−"
              label="Cash handed out, not liquidated yet"
              amount={trail.notLiquidatedTotal}
              note="The money is out of the box, but nothing is written to the sheet until the liquidation is approved."
              items={trail.notLiquidated}
            />
          ) : null}
          <Step sign="=" strong label="Cash you should hold once everything is settled" amount={trail.cashAfterSettlements} />
          {trail.owedTotal > 0 ? (
            <Step
              sign="+"
              label="Owed to employees, not paid yet"
              amount={trail.owedTotal}
              note="This cash is still in the box until you pay it and record it."
              items={trail.owedToEmployees}
            />
          ) : null}
          {trail.changeTotal > 0 ? (
            <Step
              sign="−"
              label="Change an employee still has to return"
              amount={trail.changeTotal}
              note="This cash is with the employee until it is handed back and recorded."
              items={trail.changeToCollect}
            />
          ) : null}
          <Step sign="=" strong label="Cash recorded in the app" amount={trail.recordedCash} />
        </div>

        <div className="space-y-1 rounded-lg bg-muted/50 p-3">
          <p className="font-medium">Google Sheet</p>
          <p>
            It should show <MoneyText value={expectedSheet} className="font-semibold" />
            {trail.notInSheetTotal > 0 ? <> once the pending update is written (<MoneyText value={trail.sheetShouldShow} /> after it)</> : null}.
          </p>
          {trail.sheet ? (
            sheetNow === null ? (
              <p className="text-muted-foreground">The balance has not been read from the sheet yet. Refresh the workbook to read it.</p>
            ) : (
              <>
                <p>
                  Last read from the sheet: <MoneyText value={sheetNow} className="font-semibold" />
                  {trail.sheet.syncedAt ? <span className="text-muted-foreground"> ({formatDateTime(trail.sheet.syncedAt)})</span> : null}
                </p>
                {trail.sheetUnexplained === 0 ? (
                  <p className="text-emerald-700 dark:text-emerald-400">✓ It matches what it should show.</p>
                ) : (
                  <p className="font-medium text-destructive">
                    It differs from what it should show by <MoneyText value={Math.abs(trail.sheetUnexplained ?? 0)} />{" "}
                    {(trail.sheetUnexplained ?? 0) > 0 ? "(too high)" : "(too low)"}. Look in the sheet for an entry typed by hand, a deleted row, or a pending update.
                  </p>
                )}
              </>
            )
          ) : (
            <p className="text-muted-foreground">This fund has no Google Sheet connected.</p>
          )}
        </div>

        <div className="space-y-1">
          <p className="font-medium">Why the app and the sheet differ</p>
          {trail.difference === 0 ? (
            <p className="text-muted-foreground">They agree. Nothing is waiting to be settled.</p>
          ) : (
            <>
              <p>
                The app shows <MoneyText value={trail.recordedCash} className="font-semibold" />, the sheet {sheetNow === null ? "should show" : "shows"}{" "}
                <MoneyText value={compared} className="font-semibold" />. The app is{" "}
                <MoneyText value={Math.abs(trail.difference)} className="font-semibold" /> {trail.difference > 0 ? "higher" : "lower"} because:
              </p>
              <ul className="space-y-1 pl-4">
                {trail.reasons.map((reason) => (
                  <li key={reason.text} className="list-disc">
                    <span className="font-medium">
                      {reason.sign > 0 ? "+" : "−"}
                      <MoneyText value={reason.amount} />
                    </span>{" "}
                    {reason.text}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                These differences clear on their own as liquidations are filed and approved and as settlements are recorded.
              </p>
            </>
          )}
        </div>
      </div>
    </details>
  );
}
