import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

// React runs a form `action={...}` as a transition, so a plain "pending" state set inside it
// is not shown until the server answers: the button looks clickable while the request is
// in flight. Forms must use onSubmit (state shows instantly), unless they drive the
// pending state with useTransition, which does show at once (the sign-in form).
const ALLOWED = [join("src", "app", "(auth)", "login", "login-form.tsx")];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx|jsx)$/.test(name) ? [path] : [];
  });
}

it("no form uses a form action unless it is on the reviewed list", () => {
  const offenders = files("src")
    .filter((path) => !ALLOWED.includes(path))
    .filter((path) => /<form[\s\S]{0,400}?\baction=\{/.test(readFileSync(path, "utf8")));
  expect(offenders).toEqual([]);
});

it("the reviewed form-action files still use a transition for their pending state", () => {
  for (const path of ALLOWED) expect(readFileSync(path, "utf8")).toMatch(/useGuardedTransition|useTransition/);
});
