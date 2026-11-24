// A receipt's date can be mistyped (2024 for 2026). It must not be after the day the liquidation was filed, and
// not far before it; anything outside is asked about before it reaches the books.
export const RECEIPT_MAX_AGE_DAYS = 90;

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function receiptDateProblem(expenseDate: string, filingDate: string): string | null {
  const spent = day(expenseDate);
  const filed = day(filingDate);
  if (Number.isNaN(spent) || Number.isNaN(filed)) return null;
  if (spent > filed) return `Check the receipt date ${expenseDate}: it is after the filing date ${filingDate}.`;
  if (filed - spent > RECEIPT_MAX_AGE_DAYS * 86400000)
    return `Check the receipt date ${expenseDate}: it is more than ${RECEIPT_MAX_AGE_DAYS} days before the filing date ${filingDate}.`;
  return null;
}
