import { expect, test } from "@playwright/test";

import { assertSafeTarget, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true" || !process.env.GROQ_API_KEY,
  "Needs E2E_AUTHENTICATED=true and GROQ_API_KEY (calls the real Groq API).",
);

test.describe("receipt photo fills the voucher form (desktop)", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    "Uses the desktop form layout.",
  );
  test.beforeAll(assertSafeTarget);

  test("payee, date and lines come from the photo", async ({ browser, baseURL }) => {
    const base = baseURL ?? "http://localhost:3000";
    const context = await browser.newContext();
    await context.addCookies(await cookiesFor("custodian", base));
    const page = await context.newPage();

    await page.goto(`${base}/vouchers/new`);
    await page.locator('input[type="file"]').nth(3).setInputFiles("e2e/fixtures/receipt.jpg");

    await expect(page.getByLabel("Payee")).toHaveValue(/mercury/i, { timeout: 40_000 });
    await expect(page.getByLabel("Voucher date")).toHaveValue("2026-10-30");
    await expect(page.locator("#voucher-particulars-1")).not.toHaveValue("");
    await expect(page.getByText("Total")).toContainText("340.50");
    await expect(page.getByText(/Filled in by AI/)).toBeVisible();
    await context.close();
  });

  test("a photo of the paper voucher fills every line", async ({ browser, baseURL }) => {
    const base = baseURL ?? "http://localhost:3000";
    const context = await browser.newContext();
    await context.addCookies(await cookiesFor("custodian", base));
    const page = await context.newPage();

    await page.goto(`${base}/vouchers/new?scan=1`);
    await page
      .getByTestId("paper-voucher-file")
      .setInputFiles("e2e/fixtures/paper-voucher.jpg");

    await expect(page.getByText("Reading your paper voucher")).toBeVisible();
    await expect(page.getByLabel("Payee")).toHaveValue(/tonyo/i, { timeout: 40_000 });
    await expect(page.getByLabel("Voucher date")).toHaveValue("2026-11-01");
    await expect(page.locator("#voucher-particulars-2")).not.toHaveValue("");
    await expect(page.getByText("Total")).toContainText("475.50");
    await context.close();
  });
});
