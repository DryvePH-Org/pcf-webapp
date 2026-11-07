"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Labelled select shared by URL filters and settings forms. */
export function OptionSelect({ id, name, options, value, defaultValue, onValueChange, disabled, required }: {
  id: string;
  name?: string;
  options: { value: string; label: string }[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <Select key={defaultValue} items={options} name={name} value={value} defaultValue={defaultValue} onValueChange={next => onValueChange?.(next ?? "")} disabled={disabled} required={required}>
      <SelectTrigger id={id} className="w-full min-w-0 text-base md:text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
