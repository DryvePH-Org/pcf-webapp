import { expect, test, type Browser } from "@playwright/test";

import { assertSafeTarget, cookiesFor, type Role } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);

async function dashboardAs(browser: Browser, role: Role, baseURL: string, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addCookies(await cookiesFor(role, baseURL));
  const page = await context.newPage();
  await page.goto("/dashboard");
  return page;
}

test.describe("dashboard charts", () => {
  test.beforeAll(() => assertSafeTarget());

  for (const [role, tile] of [["custodian", "Cash released this month"], ["approver", "Vouchers you approved"]] as const) {
    test(`${role}: sees their own activity charts and the page still fits the screen`, async ({ browser, baseURL, viewport }) => {
      const page = await dashboardAs(browser, role, baseURL!, viewport?.width ?? 1280);
      const section = page.getByRole("region", { name: "Your activity" });
      await expect(section).toBeVisible({ timeout: 20000 });
      await expect(section.getByText(tile).first()).toBeVisible();
      // a chart with no data says so instead of drawing an empty picture
      expect(await section.locator("svg[role=img], ul, p.text-muted-foreground").count()).toBeGreaterThan(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("an administrator does not get the personal charts", async ({ browser, baseURL }) => {
    const page = await dashboardAs(browser, "admin", baseURL!, 1280);
    await expect(page.getByRole("heading", { name: /^Welcome/ })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("region", { name: "Your activity" })).toHaveCount(0);
  });
});
