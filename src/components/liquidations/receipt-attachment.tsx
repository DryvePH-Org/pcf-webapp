"use client";

import { CircleAlert, CircleCheck, Eye, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIQUIDATION_ATTACHMENT_ACCEPT } from "@/lib/liquidation-attachment";
import { cn } from "@/lib/utils";

export function ReceiptAttachment({
  id,
  attached,
  uploading,
  failed,
  url,
  onView,
  onChoose,
  onRemove,
}: {
  id: string;
  attached: boolean;
  uploading: boolean;
  failed?: string | null;
  url?: string;
  onView?: () => void;
  onChoose: (file: File) => void;
  onRemove: () => void;
}) {
  // One state at a glance: failed (red), uploading (blue), attached (green), none (grey).
  const state = failed ? "failed" : uploading ? "uploading" : attached ? "attached" : "none";
  const tone = {
    failed: "border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
    uploading: "border-sky-400 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40",
    attached: "border-emerald-500 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
    none: "border-dashed bg-muted/30",
  }[state];
  return (
    <div className={cn("min-w-0 space-y-2 rounded-lg border-2 p-3", tone)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Receipt attachment</p>
        <span
          role="status"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            state === "failed" && "bg-red-600 text-white",
            state === "uploading" && "bg-sky-600 text-white",
            state === "attached" && "bg-emerald-600 text-white",
            state === "none" && "bg-muted text-muted-foreground",
          )}
        >
          {state === "failed" ? <CircleAlert aria-hidden="true" className="size-3.5" /> : null}
          {state === "uploading" ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
          {state === "attached" ? <CircleCheck aria-hidden="true" className="size-3.5" /> : null}
          {state === "failed"
            ? "Upload failed"
            : state === "uploading"
              ? "Uploading…"
              : state === "attached"
                ? "Attached"
                : "No file yet"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="relative inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring"
        >
          <Paperclip aria-hidden="true" className="size-4 shrink-0" />
          {uploading ? "Uploading…" : failed ? "Try again" : attached ? "Replace file" : "Choose file"}
          <input
            id={id}
            type="file"
            accept={LIQUIDATION_ATTACHMENT_ACCEPT}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onChoose(file);
            }}
          />
        </label>
        {attached && !failed && (url || onView) ? (
          url ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              nativeButton={false}
              render={<a href={url} target="_blank" rel="noreferrer" />}
            >
              <Eye />
              View attachment
            </Button>
          ) : (
            <Button type="button" variant="outline" className="min-h-11" onClick={onView}>
              <Eye />
              View attachment
            </Button>
          )
        ) : null}
        {attached && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <X />
            Remove
          </Button>
        )}
      </div>
      <p
        className={cn(
          "text-xs",
          failed ? "font-medium text-red-700 dark:text-red-300" : "text-muted-foreground",
        )}
        aria-live="polite"
      >
        {failed
          ? `${failed} Choose the file again.`
          : attached
            ? "The file is saved with this line."
            : "JPEG, PNG, WebP, PDF, HEIC, or HEIF · up to 20 MB"}
      </p>
    </div>
  );
}
