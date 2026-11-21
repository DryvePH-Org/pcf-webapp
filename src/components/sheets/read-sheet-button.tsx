"use client";

import { useState } from "react";
import { toast } from "sonner";

import { readSheetNow } from "@/actions/sheet-read";
import { Button } from "@/components/ui/button";
import { usePending } from "@/lib/use-single-flight";

// Administrators only. The answer arrives from Grokbot a little later; changes show on the Accounting page.
export function ReadSheetButton({ book }: { book: string }) {
  const [pending, setPending, isBusy] = usePending();
  const [asked, setAsked] = useState(false);
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={async () => {
          if (isBusy()) return;
          setPending(true);
          try {
            const result = await readSheetNow(book);
            if (result.ok) {
              setAsked(true);
              toast.success("Grokbot was asked to read the sheet.");
            } else toast.error(result.error);
          } catch {
            toast.error("Could not ask Grokbot. Try again.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Asking Grokbot…" : "Read the sheet now"}
      </Button>
      <p role="status" className="text-xs text-muted-foreground">
        {asked
          ? "Asked. Changes made by hand in the sheet show on the Accounting page in a few minutes."
          : "Asks Grokbot to read the sheet and send it back, so hand edits reach the app. It also happens after every approved liquidation."}
      </p>
    </div>
  );
}
