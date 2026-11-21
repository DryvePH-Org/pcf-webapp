"use client";

import { Eye, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIQUIDATION_ATTACHMENT_ACCEPT } from "@/lib/liquidation-attachment";
import { cn } from "@/lib/utils";

export const MAX_EXTRA_PICTURES = 5;

// More pictures of the same receipt (a long receipt, both sides, several photos). The first picture stays in the
// "Receipt attachment" box above; these are numbered from 2.
export function MorePictures({
  id,
  paths,
  busy,
  disabled,
  onAdd,
  onView,
  onRemove,
}: {
  id: string;
  paths: string[];
  busy: boolean;
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onView: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  const full = paths.length >= MAX_EXTRA_PICTURES;
  return (
    <div className="min-w-0 space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">More pictures of this receipt <span className="font-normal text-muted-foreground">(optional)</span></p>
        <span className="text-xs text-muted-foreground">{paths.length} of {MAX_EXTRA_PICTURES} added</span>
      </div>
      {paths.length ? (
        <ul className="space-y-2">
          {paths.map((path, index) => (
            <li key={path} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5">
              <span className="text-sm font-medium">Picture {index + 2}</span>
              <span className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => onView(path)}>
                  <Eye />
                  View
                </Button>
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove picture ${index + 2}`} onClick={() => onRemove(path)}>
                  <X />
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <label
        htmlFor={id}
        className={cn(
          "relative inline-flex min-h-11 max-w-full items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring",
          full || disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        )}
      >
        <ImagePlus aria-hidden="true" className="size-4 shrink-0" />
        {busy ? "Uploading…" : full ? "Limit reached" : "Add pictures"}
        <input
          id={id}
          type="file"
          multiple
          accept={LIQUIDATION_ATTACHMENT_ACCEPT}
          disabled={full || disabled}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (files.length) onAdd(files);
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Use this for a long receipt, both sides, or several photos. You can choose more than one at a time. Up to {MAX_EXTRA_PICTURES} more.
      </p>
    </div>
  );
}
