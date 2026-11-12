"use client";
import { usePending } from "@/lib/use-single-flight";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLiquidation } from "@/actions/liquidations";
import { Button } from "@/components/ui/button";
export function CreateLiquidationButton({ voucherId, fullWidth = false }: { voucherId: string; fullWidth?: boolean }) {
  const router = useRouter();
  const [pending, setPending, isBusy] = usePending();
  return <Button disabled={pending} size="lg" className={fullWidth ? "w-full print:hidden" : "print:hidden"} onClick={async () => {
    if (isBusy()) return;
    setPending(true);
    let leaving = false;
    try {
      const result = await createLiquidation(voucherId);
      if (!result.ok) { toast.error(result.error); return; }
      // Stay disabled while the next page opens, so a second click cannot repeat it.
      leaving = true;
      router.push(`/liquidations/${result.id}`); router.refresh();
    } catch { toast.error("Could not start liquidation. Try again."); }
    finally { if (!leaving) setPending(false); }
  }}>{pending ? "Opening..." : "File liquidation"}</Button>;
}
