import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

test.describe("double-clicks never save twice (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    await adminClient().from("budget_requests").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  });

  test("a double-clicked budget request is saved once", async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto("/requests/new");

    await page.getByLabel(/^Budget needed/).fill("750");
    await page.getByLabel(/^What is the budget for/).fill("E2E double click request");
    const fund = page.getByRole("combobox", { name: /Fund/ });
    if ((await fund.textContent())?.includes("Choose")) {
      await fund.click();
      await page.getByRole("option").nth(1).click();
    }

    const submit = page.getByRole("button", { name: "Submit budget request" });
    await submit.dblclick({ delay: 30 });
    await submit.click({ trial: false, force: true, timeout: 1000 }).catch(() => undefined);

    await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/);
    await page.waitForTimeout(1500);
    const { data } = await adminClient()
      .from("budget_requests")
      .select("id")
      .eq("purpose", "E2E double click request");
    expect(data).toHaveLength(1);
    await context.close();
  });

  test("a double-clicked voucher draft is saved once", async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto("/vouchers/new");

    await page.locator("#voucher-payee").fill("E2E Double Click Payee");
    await page.locator("#voucher-particulars-0").fill("E2E double click voucher");
    await page.locator("#voucher-amount-0").fill("120");

    const save = page.getByRole("button", { name: "Save draft" });
    await save.dblclick({ delay: 30 });

    await page.waitForURL(/\/vouchers\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    const { data } = await adminClient()
      .from("vouchers")
      .select("id")
      .eq("payee", "E2E Double Click Payee");
    expect(data).toHaveLength(1);
    await context.close();
  });

  test("the server refuses the same request sent twice in a row", async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    await context.addCookies(await cookiesFor("approver", baseURL!));
    const page = await context.newPage();
    await page.goto("/requests/new");
    const fillAndSend = async () => {
      await page.getByLabel(/^Budget needed/).fill("333");
      await page.getByLabel(/^What is the budget for/).fill("E2E repeat request");
      const fund = page.getByRole("combobox", { name: /Fund/ });
      if ((await fund.textContent())?.includes("Choose")) {
        await fund.click();
        await page.getByRole("option").nth(1).click();
      }
      await page.getByRole("button", { name: "Submit budget request" }).click();
    };
    await fillAndSend();
    await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/);

    // Same person, same content, moments later (for example a second tab).
    await page.goto("/requests/new");
    await fillAndSend();
    await expect(page.getByText(/already sent a moment ago/)).toBeVisible();

    const { data } = await adminClient().from("budget_requests").select("id").eq("purpose", "E2E repeat request");
    expect(data).toHaveLength(1);
    await context.close();
  });
});
