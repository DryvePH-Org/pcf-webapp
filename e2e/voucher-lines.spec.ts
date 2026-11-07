import { expect, test } from "@playwright/test";

import { assertSafeTarget, cleanTestData, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against the development project.",
);

test.describe("custodian prepares a multi-line voucher (desktop)", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    "Uses the desktop form layout.",
  );

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
  });
  test.afterAll(cleanTestData);

  test("two lines, two categories, one total", async ({ browser, baseURL }) => {
    const base = baseURL ?? "http://localhost:3000";
    const context = await browser.newContext();
    await context.addCookies(await cookiesFor("custodian", base));
    const page = await context.newPage();

    await page.goto(`${base}/vouchers/new`);
    await page.getByLabel("Payee").fill("E2E Hardware Store");

    await page.locator("#voucher-particulars-0").fill("Padlocks");
    await page.locator("#voucher-amount-0").fill("120.50");
    await page.locator("#voucher-category-0").click();
    await page.getByRole("option").first().click();

    await page.getByRole("button", { name: "Add line" }).click();
    await page.locator("#voucher-particulars-1").fill("Delivery");
    await page.locator("#voucher-amount-1").fill("80");
    await page.locator("#voucher-category-1").click();
    await page.getByRole("option").nth(1).click();

    await expect(page.getByTestId("line-total")).toContainText("200.50");

    await page.getByRole("button", { name: "Save draft" }).click();
    await page.waitForURL(/\/vouchers\/[0-9a-f-]{36}$/);

    await expect(page.getByText("Padlocks").first()).toBeVisible();
    await expect(page.getByText("Delivery").first()).toBeVisible();
    await expect(page.getByText("Multiple categories").first()).toBeVisible();

    // The draft can be corrected from the voucher page.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.waitForURL(/\/edit$/);
    await page.locator("#voucher-amount-1").fill("99.50");
    await expect(page.getByTestId("line-total")).toContainText("220.00");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/vouchers\/[0-9a-f-]{36}$/);
    await expect(page.getByText("220.00").first()).toBeVisible();
    await context.close();
  });
});
