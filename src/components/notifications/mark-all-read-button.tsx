"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { markAllNotificationsRead } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { usePending } from "@/lib/use-single-flight";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, setPending, isBusy] = usePending();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        if (isBusy()) return;
        setPending(true);
        try {
          const result = await markAllNotificationsRead();
          if (!result.ok) toast.error(result.error);
          else router.refresh();
        } catch {
          toast.error("Could not update. Try again.");
        } finally {
          setPending(false);
        }
      }}
    >
      Mark all read
    </Button>
  );
}
