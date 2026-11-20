import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

const tag = Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
const EMAIL = `remove-me-${tag}@pcf.local`;
const NAME = `Remove Me ${tag}`;

async function authUserId(email: string) {
  const { data } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.find((user) => user.email === email)?.id ?? null;
}

test.describe("user management: passwords and removing a user (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
  });
  test.afterAll(async () => {
    const left = await authUserId(EMAIL);
    if (left) await adminClient().auth.admin.deleteUser(left);
    await cleanTestData();
  });

  test("a new user: the password is shown on request, typed twice, and can be generated", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("admin", baseURL!));
    const page = await context.newPage();
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "New user" }).click();
    await page.getByLabel("Full name").fill(NAME);
    await page.getByLabel("Email").fill(EMAIL);
    const password = page.getByLabel("Password", { exact: true });
    const confirm = page.getByLabel("Confirm password");

    // hidden by default; the eye shows both
    await password.fill("Phase1-Strong-Pw");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).first().click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(confirm).toHaveAttribute("type", "text");

    // two different passwords are caught, before and at Create
    await confirm.fill("Phase1-Strong-Px");
    await expect(page.getByText("The two passwords don't match yet.")).toBeVisible();
    await page.getByRole("button", { name: "Create user" }).click();
    await expect(page.getByText("The two passwords don't match.")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "New user" })).toBeVisible();
    expect(await authUserId(EMAIL)).toBeNull();

    // a strong one is made in both boxes and shown
    await page.getByRole("button", { name: "Generate a strong one" }).click();
    const made = await password.inputValue();
    expect(made).toMatch(/^[A-HJ-NP-Za-km-z2-9]{7}-[A-HJ-NP-Za-km-z2-9]{7}$/);
    await expect(confirm).toHaveValue(made);
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByText("The passwords match.")).toBeVisible();

    await page.getByRole("button", { name: "Create user" }).click();
    await expect(page.getByText(`Account created for ${NAME}`)).toBeVisible();
    await expect(page.locator("tr", { hasText: EMAIL })).toBeVisible();
    expect(await authUserId(EMAIL)).not.toBeNull();
    await context.close();
  });

  test("resetting a password also asks twice", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("admin", baseURL!));
    const page = await context.newPage();
    await page.goto("/admin/users");
    await page.locator("tr", { hasText: EMAIL }).getByRole("button", { name: "Reset password" }).click();
    await page.getByLabel("New password", { exact: true }).fill("Another-Strong-1");
    await page.getByLabel("Confirm new password").fill("Another-Strong-2");
    await expect(page.getByText("The two passwords don't match yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Set new password" })).toBeDisabled();
    await page.getByLabel("Confirm new password").fill("Another-Strong-1");
    await expect(page.getByText("The passwords match.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Set new password" })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel" }).click();
    await context.close();
  });

  test("a person with no history is removed completely, and the email is free again", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("admin", baseURL!));
    const page = await context.newPage();
    await page.goto("/admin/users");
    await page.locator("tr", { hasText: EMAIL }).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Remove this user?")).toBeVisible();
    await expect(page.getByText(/cannot be undone/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Remove user" }).click();
    await expect(page.getByText(`${NAME} was removed`)).toBeVisible();
    await expect(page.locator("tr", { hasText: EMAIL })).toHaveCount(0);
    expect((await adminClient().from("profiles").select("id").eq("full_name", NAME)).data).toHaveLength(0);
    expect(await authUserId(EMAIL)).toBeNull();
    await context.close();
  });

  test("a custodian who holds a fund, and a person with a request, are not removed", async ({ browser, baseURL }) => {
    // the accounting person makes a request, so they now have history
    const accounting = await clientFor("accounting");
    const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
    const made = await accounting.rpc("create_budget_request", { p_fund_id: fund!.id, p_name: "Accounting", p_amount: 100, p_purpose: `History ${tag}` });
    expect(made.error).toBeNull();

    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("admin", baseURL!));
    const page = await context.newPage();
    await page.goto("/admin/users");

    await page.locator("tr", { hasText: "custodian@pcf.local" }).getByRole("button", { name: "Remove" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove user" }).click();
    await expect(page.getByText(/still holds/)).toBeVisible();
    await expect(page.locator("tr", { hasText: "custodian@pcf.local" })).toHaveCount(1);

    await page.locator("tr", { hasText: "accounting@pcf.local" }).getByRole("button", { name: "Remove" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove user" }).click();
    await expect(page.getByText(/has records in the system/)).toBeVisible();
    await expect(page.locator("tr", { hasText: "accounting@pcf.local" })).toHaveCount(1);
    expect(await authUserId("accounting@pcf.local")).not.toBeNull();
    // nobody can remove their own account: there is no button on their own row
    await expect(page.locator("tr", { hasText: "admin@pcf.local" }).getByRole("button", { name: "Remove" })).toHaveCount(0);
    await context.close();
  });
});
