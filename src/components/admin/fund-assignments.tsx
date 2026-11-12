"use client";
import { useState } from "react";
import { usePending } from "@/lib/use-single-flight";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignFundCustodians } from "@/actions/funds";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import type { CustodianOption } from "./types";
export function FundAssignments({ fundId, name, selected, custodians }: { fundId: string; name: string; selected: string[]; custodians: CustodianOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState(selected);
  const [pending, setPending, isBusy] = usePending();
  return <><Button className="h-11" variant="outline" onClick={() => { setIds(selected); setOpen(true); }}>Assign custodians</Button>
    <ResponsiveDialog open={open} onOpenChange={setOpen} title={`Custodians — ${name}`} description="A fund may have multiple active custodians. Changing assignments changes their access immediately; historical records stay intact.">
      <div className="max-h-80 space-y-2 overflow-y-auto">{custodians.map(c => <label key={c.id} className="flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm"><input type="checkbox" disabled={pending} checked={ids.includes(c.id)} onChange={e => setIds(e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id))} />{c.full_name}</label>)}{custodians.length === 0 ? <p className="text-sm">An administrator must create an active custodian account first.</p> : null}</div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending || ids.length > 20} onClick={async () => {
        if (isBusy()) return;
    setPending(true);
        try { const result = await assignFundCustodians({ fundId, custodianIds: ids }); if (!result.ok) { toast.error(result.error); return; } toast.success("Custodian assignments updated"); setOpen(false); router.refresh(); }
        catch { toast.error("Could not update assignments. Try again."); }
        finally { setPending(false); }
      }}>{pending ? "Saving..." : "Save assignments"}</Button></div>
    </ResponsiveDialog></>;
}
