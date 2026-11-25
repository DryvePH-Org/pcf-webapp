import { Check, TriangleAlert } from "lucide-react";

import { PhoneCollapse } from "@/components/shared/phone-collapse";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";

export type SheetEdit = {
  id: string;
  kind: string;
  summary: string;
  applied: boolean;
  detected_at: string;
  resolved_at: string | null;
};

// What accounting changed by hand in the Google Sheet, and how the app reacted: a changed tag is copied into the
// app (listed here so nothing changes silently); anything that does not fit waits here until the two agree again.
export function SheetEditsPanel({ edits }: { edits: SheetEdit[] }) {
  if (!edits.length) return null;
  const open = edits.filter((edit) => !edit.applied && !edit.resolved_at);
  const followed = edits.filter((edit) => edit.applied);
  return (
    <PhoneCollapse
      anchor="sheet-edits"
      title={`Changes from the Google Sheet (${edits.length})`}
      hint={open.length ? `${open.length} to check` : "The app already follows them"}
    >
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Changes from the Google Sheet</CardTitle>
          <CardDescription>
            When accounting changes a tag in the sheet, the app follows it the next time the sheet is read, and it is listed here. Amounts are never changed from the sheet: a row that does not match is listed to check. A voucher number in the sheet that the app does not know, or a voucher that went missing from the sheet, is listed here too.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {open.length ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">To check</h3>
              <ul className="space-y-2">
                {open.map((edit) => (
                  <li key={edit.id} className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span>{edit.summary}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {followed.length ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">The app now matches the sheet</h3>
              <ul className="space-y-2">
                {followed.map((edit) => (
                  <li key={edit.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span className="min-w-0">
                      {edit.summary}
                      <span className="mt-0.5 block text-xs text-muted-foreground">{formatDate(edit.detected_at.slice(0, 10))}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PhoneCollapse>
  );
}
