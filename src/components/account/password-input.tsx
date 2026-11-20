"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";

// A password box with a show/hide button, so people can check what they typed.
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
  disabled,
  visible: controlledVisible,
  onVisibleChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
  disabled?: boolean;
  // Optional: let the parent decide whether the password is shown (for example after one is generated).
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}) {
  const [ownVisible, setOwnVisible] = useState(false);
  const visible = controlledVisible ?? ownVisible;
  const setVisible = (next: boolean) => (onVisibleChange ? onVisibleChange(next) : setOwnVisible(next));
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        maxLength={128}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
