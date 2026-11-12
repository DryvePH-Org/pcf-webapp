"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { useClickLatch } from "@/lib/use-single-flight";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  pending = false,
  destructive = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  // A second click (or tap) while the first is still being handled is ignored,
  // even before `pending` has had time to turn the button off.
  const { once, release } = useClickLatch();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) release();
    wasPending.current = pending;
  }, [pending, release]);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      {children}
      <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          onClick={() => once(onConfirm)}
          disabled={pending}
        >
          {pending ? "Working..." : confirmLabel}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
