// Only the workbooks that have their own Grokbot are open (MAD Buying and DRYVE).
// The others stay closed and are opened one at a time. To open the next one, add
// its id here and in grokbot/targets.ts, and give it its own bot and routine.
export const OPEN_WORKBOOKS = ["buying", "dryve"] as const;

export function isBookOpen(id: string) {
  return (OPEN_WORKBOOKS as readonly string[]).includes(id);
}

export const CLOSED_BOOK_MESSAGE =
  "This workbook is not open yet. Only MAD Buying and DRYVE are connected for now; the others will be opened one at a time.";
