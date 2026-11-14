import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

test.describe("buttons show they are working right after the click (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    await adminClient().from("budget_requests").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  });

  test("the budget request button locks and says it is submitting while the server is slow", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    // A slow server: hold the form's request for 3 seconds so the "working" state is visible.
    await page.route("**/requests/new", async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await page.goto("/requests/new");
    await page.getByLabel(/^Budget needed/).fill("300");
    await page.getByLabel(/^What is the budget for/).fill(`E2E feedback ${Date.now()}`);
    const fund = page.getByRole("combobox", { name: /Fund/ });
    if ((await fund.textContent())?.includes("Choose")) {
      await fund.click();
      await page.getByRole("option").nth(1).click();
    }
    const button = page.getByRole("button", { name: /Submit budget request|Submitting/ });
    await button.click();
    // Within a fraction of a second, not after the server answers.
    await expect(page.getByRole("button", { name: /Submitting/ })).toBeVisible({ timeout: 800 });
    await expect(page.getByRole("button", { name: /Submitting/ })).toBeDisabled();
    await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/, { timeout: 15000 });
    const { data } = await adminClient().from("budget_requests").select("id");
    expect(data).toHaveLength(1);
  });

  test("the voucher draft button locks and says it is saving while the server is slow", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.route("**/vouchers/new**", async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await page.goto("/vouchers/new");
    await page.locator("#voucher-payee").fill("E2E Feedback Payee");
    await page.locator("#voucher-particulars-0").fill("E2E feedback voucher");
    await page.locator("#voucher-amount-0").fill("90");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("button", { name: /Saving/ }).first()).toBeVisible({ timeout: 800 });
    await expect(page.getByRole("button", { name: /Saving/ }).first()).toBeDisabled();
    await page.waitForURL(/\/vouchers\/[0-9a-f-]{36}$/, { timeout: 30000 });
  });

  test("the sign-in button locks and says it is signing in while the server is slow", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.route("**/login", async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await page.goto("/login");
    await page.getByLabel("Email").fill("custodian@pcf.local");
    await page.getByLabel("Password").fill("Phase1-Dev-Passw0rd");
    await page.getByRole("button", { name: /^Sign in$/ }).click();
    await expect(page.getByRole("button", { name: /Signing in/ })).toBeVisible({ timeout: 800 });
    await expect(page.getByRole("button", { name: /Signing in/ })).toBeDisabled();
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  });

  test("an approval dialog button locks and says it is working while the server is slow", async ({ browser, baseURL }) => {
    // A request waiting for the admin to review (the fund has no other reviewer).
    const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
    const admin = await clientFor("admin");
    await admin.rpc("set_fund_approvers", { p_fund_id: fund!.id, p_approver_ids: [] });
    await admin.rpc("set_fund_self_approval", { p_fund_id: fund!.id, p_allowed: false });
    const custodian = await clientFor("custodian");
    const request = await custodian.rpc("create_budget_request", { p_fund_id: fund!.id, p_name: "Custodian", p_amount: 200, p_purpose: `E2E approve ${Date.now()}` });
    expect(request.error).toBeNull();

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(await cookiesFor("admin", baseURL!));
    const page = await context.newPage();
    await page.route(`**/requests/${request.data}`, async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await page.goto(`/requests/${request.data}`);
    await page.getByRole("button", { name: "Approve request" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Approve/ }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /Working/ })).toBeVisible({ timeout: 800 });
    await expect(page.getByRole("dialog").getByRole("button", { name: /Working/ })).toBeDisabled();
    await expect(page.getByText(/Approved\. Next: create the voucher/)).toBeVisible({ timeout: 15000 });
  });
});
