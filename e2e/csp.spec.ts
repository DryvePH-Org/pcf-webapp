import { expect, test } from "@playwright/test";
import { cookiesFor } from "./helpers";

test.skip(process.env.E2E_AUTHENTICATED !== "true", "authenticated only");

test("no CSP violations on main pages", async ({ browser, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  const context = await browser.newContext();
  await context.addCookies(await cookiesFor("custodian", base));
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("console", (m) => { if (/content security policy|refused to/i.test(m.text())) problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  for (const path of ["/dashboard", "/vouchers", "/vouchers/new"]) {
    await page.goto(base + path);
    await page.waitForLoadState("networkidle");
  }
  // hydration works: the add-line button responds
  await page.goto(base + "/vouchers/new");
  await page.getByRole("button", { name: "Add line" }).click();
  await expect(page.locator("#voucher-particulars-1")).toBeVisible();
  expect(problems).toEqual([]);
});
