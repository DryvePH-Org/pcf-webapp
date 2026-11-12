import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { adminClient, assertSafeTarget, cookiesFor, testEmail } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

// Development seed password (see supabase/seed.sql); restored after the tests.
const DEV_PASSWORD = "Phase1-Dev-Passw0rd";

async function canSignIn(email: string, password: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}

async function restore(role: "custodian" | "approver") {
  const admin = adminClient();
  const { data } = await admin.from("profiles").select("id").eq("full_name", role === "custodian" ? "PCF Custodian" : "PCF Approver").single();
  if (data) await admin.auth.admin.updateUserById(data.id, { password: DEV_PASSWORD });
}

test.describe("passwords (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop sidebar menu.");
  test.beforeAll(assertSafeTarget);
  test.afterAll(async () => {
    await restore("custodian");
    await restore("approver");
  });

  test("a user changes their own password from the account menu", async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto("/dashboard");

    await page.getByRole("button", { name: /PCF Custodian/ }).first().click();
    await page.getByRole("menuitem", { name: "Change password" }).click();
    const dialog = page.getByRole("dialog");

    // Wrong current password is refused next to that field.
    await dialog.getByLabel("Current password").fill("not-my-password");
    await dialog.getByLabel("New password", { exact: true }).fill("Brand-new-pass-1");
    await dialog.getByLabel("New password again").fill("Brand-new-pass-1");
    await dialog.getByRole("button", { name: "Change password" }).click();
    await expect(dialog.getByText("Your current password is not correct.")).toBeVisible();

    await dialog.getByLabel("Current password").fill(DEV_PASSWORD);
    await dialog.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed.").first()).toBeVisible();

    // Still signed in here, and only the new password works from now on.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    expect(await canSignIn(testEmail("custodian"), "Brand-new-pass-1")).toBe(true);
    expect(await canSignIn(testEmail("custodian"), DEV_PASSWORD)).toBe(false);
    await context.close();
  });

  test("an admin resets another user's password", async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    await context.addCookies(await cookiesFor("admin", baseURL!));
    const page = await context.newPage();
    await page.goto("/admin/users");

    const row = page.getByRole("row", { name: /PCF Approver/ });
    await row.getByRole("button", { name: "Reset password" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Generate a strong one" }).click();
    const generated = await dialog.getByLabel("New password").inputValue();
    expect(generated).toMatch(/^[A-Za-z2-9]{7}-[A-Za-z2-9]{7}$/);
    await dialog.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByText(/New password set for PCF Approver/).first()).toBeVisible();

    expect(await canSignIn(testEmail("approver"), generated)).toBe(true);
    expect(await canSignIn(testEmail("approver"), DEV_PASSWORD)).toBe(false);

    // The reset is in the audit trail, without the password.
    const { data } = await adminClient()
      .from("audit_log")
      .select("new_data")
      .eq("entity_type", "profiles")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(JSON.stringify(data?.new_data)).not.toContain(generated);
    await context.close();
  });
});
