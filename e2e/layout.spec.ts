import { expect, test } from "@playwright/test";

import { cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against the development project.",
);

const PAGES = [
  "/dashboard",
  "/vouchers",
  "/approvals",
  "/replenishments",
  "/cash-count",
  "/reports",
  "/audit",
  "/admin/users",
  "/admin/funds",
  "/admin/categories",
];

test("every page fits the screen width without horizontal scroll", async ({
  browser,
  baseURL,
  viewport,
}) => {
  const base = baseURL ?? "http://localhost:3000";
  const context = await browser.newContext({ viewport });
  await context.addCookies(await cookiesFor("admin", base));
  const page = await context.newPage();

  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(fits, `${path} overflows horizontally`).toBe(true);
  }
});
