// Only MAD Buying is connected to Grokbot for now. The other workbooks stay
// closed and are opened one at a time. To open the next one, add its id here
// and teach Grokbot's routine its destination.
export const OPEN_WORKBOOKS = ["buying"] as const;

export function isBookOpen(id: string) {
  return (OPEN_WORKBOOKS as readonly string[]).includes(id);
}

export const CLOSED_BOOK_MESSAGE =
  "This workbook is not open yet. Only MAD Buying is connected for now; the others will be opened one at a time.";
