import { expect, test } from "@playwright/test";

import { assertSafeTarget, cleanTestData, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);

test.beforeAll(async () => {
  assertSafeTarget();
  await cleanTestData();
});

// On a phone the Accounting page keeps the search, the totals and the records in view; the long parts open on request.
test("phone: filters and the two long blocks are closed until asked for", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await context.addCookies(await cookiesFor("accounting", baseURL!));
  const page = await context.newPage();
  await page.goto("/accounting", { waitUntil: "networkidle" });

  await expect(page.getByLabel("Search expenses")).toBeVisible();
  await expect(page.getByLabel("Records from")).toBeHidden();
  await expect(page.getByRole("button", { name: /^Filters/ })).toBeVisible();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThan(2400);
  await page.screenshot({ path: process.env.ACCOUNTING_SHOT ?? "test-results/accounting-phone.png", fullPage: true });

  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Records from")).toBeVisible();
  await expect(page.getByLabel("Period")).toBeVisible();
  await page.getByRole("button", { name: "Hide filters" }).click();
  await expect(page.getByLabel("Records from")).toBeHidden();

  await expect(page.getByRole("heading", { name: "Current workbook balances" })).toBeHidden();
  await page.getByRole("button", { name: /^Workbook balances/ }).click();
  await expect(page.getByRole("heading", { name: "Current workbook balances" })).toBeVisible();

  await expect(page.locator("#breakdowns")).toBeHidden();
  await page.getByRole("button", { name: /^Spending breakdowns/ }).click();
  await expect(page.locator("#breakdowns")).toBeVisible();
  await context.close();
});

test("desktop: everything stays open as before", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await cookiesFor("accounting", baseURL!));
  const page = await context.newPage();
  await page.goto("/accounting", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Records from")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current workbook balances" })).toBeVisible();
  await expect(page.locator("#breakdowns")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Filters/ })).toBeHidden();
  await context.close();
});
