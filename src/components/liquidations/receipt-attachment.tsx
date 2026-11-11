"use client";

import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIQUIDATION_ATTACHMENT_ACCEPT } from "@/lib/liquidation-attachment";

export function ReceiptAttachment({
  id,
  attached,
  uploading,
  url,
  onChoose,
  onRemove,
}: {
  id: string;
  attached: boolean;
  uploading: boolean;
  url?: string;
  onChoose: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="min-w-0 space-y-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm font-medium">
        Receipt attachment{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="relative inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring"
        >
          <Paperclip aria-hidden="true" className="size-4 shrink-0" />
          {uploading ? "Uploading…" : attached ? "Replace file" : "Choose file"}
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
        {attached && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <X />
            Remove attachment
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            Open attached receipt
          </a>
        ) : attached ? (
          "Receipt attached"
        ) : (
          "JPEG, PNG, WebP, PDF, HEIC, or HEIF · up to 20 MB"
        )}
      </p>
    </div>
  );
}
