"use client";
import { usePending } from "@/lib/use-single-flight";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLiquidation, createLiquidationFor } from "@/actions/liquidations";
import { Button } from "@/components/ui/button";
// forName: a custodian (or administrator) files it for that employee, who cannot use the website.
export function CreateLiquidationButton({ voucherId, fullWidth = false, forName }: { voucherId: string; fullWidth?: boolean; forName?: string }) {
  const router = useRouter();
  const [pending, setPending, isBusy] = usePending();
  return <Button disabled={pending} size="lg" className={fullWidth ? "w-full print:hidden" : "print:hidden"} onClick={async () => {
    if (isBusy()) return;
    setPending(true);
    let leaving = false;
    try {
      const result = forName ? await createLiquidationFor(voucherId) : await createLiquidation(voucherId);
      if (!result.ok) { toast.error(result.error); return; }
      // Stay disabled while the next page opens, so a second click cannot repeat it.
      leaving = true;
      router.push(`/liquidations/${result.id}`); router.refresh();
    } catch { toast.error("Could not start liquidation. Try again."); }
    finally { if (!leaving) setPending(false); }
  }}>{pending ? "Opening..." : forName ? `File liquidation for ${forName.split(/\s+/)[0]}` : "File liquidation"}</Button>;
}
