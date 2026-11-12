"use client";

import { Button } from "@/components/ui/button";

// "Not applicable" in one tap: fills the field with N/A (tap again to clear it).
export function NaButton({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const on = value.trim().toUpperCase() === "N/A";
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? "default" : "outline"}
      className="h-7 px-2.5 text-xs font-semibold"
      disabled={disabled}
      aria-pressed={on}
      onClick={() => onChange(on ? "" : "N/A")}
    >
      N/A
    </Button>
  );
}
