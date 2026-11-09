"use client";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
export function AccountingExportButton({
  url,
  disabled = false,
}: {
  url: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  async function exportRows() {
    setPending(true);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Could not export these expenses.");
      }
      const object = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = object;
      link.download = "accounting-expenses.csv";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(object);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Export unavailable. Try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Button
      variant="outline"
      disabled={disabled || pending}
      onClick={() => void exportRows()}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Download />}
      {pending ? "Exporting…" : "Export filtered CSV"}
    </Button>
  );
}
