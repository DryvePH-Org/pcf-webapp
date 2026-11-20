import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PasswordInput } from "@/components/account/password-input";
import { generatePassword } from "@/lib/password-generator";
import { newPasswordSchema } from "@/lib/validators/auth";
import { createUserFormSchema } from "@/lib/validators/user";

const base = { full_name: "Maria Santos", email: "maria@example.com", role: "requester" as const };

describe("creating a user: the password is typed twice", () => {
  it("accepts two matching passwords", () => {
    expect(createUserFormSchema.safeParse({ ...base, password: "Strong-Pass-1", confirm: "Strong-Pass-1" }).success).toBe(true);
  });
  it("says so when the two do not match, on the confirm field", () => {
    const parsed = createUserFormSchema.safeParse({ ...base, password: "Strong-Pass-1", confirm: "Strong-Pass-2" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(["confirm"]);
      expect(parsed.error.issues[0].message).toBe("The two passwords don't match.");
    }
  });
  it("still needs a password of 8 characters or more", () => {
    const parsed = createUserFormSchema.safeParse({ ...base, password: "short", confirm: "short" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.message === "Use at least 8 characters.")).toBe(true);
  });
  it("does not trim the password: spaces count, so a trailing space is a different password", () => {
    expect(createUserFormSchema.safeParse({ ...base, password: "Strong-Pass-1 ", confirm: "Strong-Pass-1" }).success).toBe(false);
  });
});

describe("a generated password", () => {
  it("is readable, long enough and never repeats", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const made = generatePassword();
      expect(made).toMatch(/^[A-HJ-NP-Za-km-z2-9]{7}-[A-HJ-NP-Za-km-z2-9]{7}$/);
      expect(newPasswordSchema.safeParse(made).success).toBe(true);
      seen.add(made);
    }
    expect(seen.size).toBe(300);
  });
});

describe("the password box", () => {
  const noop = () => undefined;
  it("hides the password by default, and shows it when asked", () => {
    const hidden = renderToStaticMarkup(<PasswordInput id="p" value="secret" onChange={noop} autoComplete="new-password" />);
    expect(hidden).toContain('type="password"');
    expect(hidden).toContain('aria-label="Show password"');
    const shown = renderToStaticMarkup(<PasswordInput id="p" value="secret" onChange={noop} autoComplete="new-password" visible onVisibleChange={noop} />);
    expect(shown).toContain('type="text"');
    expect(shown).toContain('aria-label="Hide password"');
  });
});
