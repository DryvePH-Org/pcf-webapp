"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLiquidation } from "@/actions/liquidations";
import { Button } from "@/components/ui/button";
export function CreateLiquidationButton({ voucherId }: { voucherId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return <Button disabled={pending} size="lg" className="print:hidden" onClick={async () => {
    setPending(true);
    try {
      const result = await createLiquidation(voucherId);
      if (!result.ok) { toast.error(result.error); return; }
      router.push(`/liquidations/${result.id}`); router.refresh();
    } catch { toast.error("Could not start liquidation. Try again."); }
    finally { setPending(false); }
  }}>{pending ? "Opening..." : "File liquidation"}</Button>;
}
