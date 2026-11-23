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

test("the server says which build it runs", async ({ request }) => {
  const response = await request.get("/api/version");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const { id } = (await response.json()) as { id: string };
  expect(id.length).toBeGreaterThan(5);
});

for (const [name, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`${name}: nothing is shown while the page is current; after an update it offers a reload`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport, hasTouch: name === "phone", isMobile: name === "phone" });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const banner = page.getByText("A new version of the app is ready.");

    // the same build: even when the tab regains focus, nothing appears
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(800);
    await expect(banner).toBeHidden();

    // the app is updated while this page is open
    await page.route("**/api/version", (route) => route.fulfill({ json: { id: "a-newer-build" } }));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(banner).toBeVisible();
    await expect(page.getByText(/Liquidation drafts save themselves/)).toBeVisible();
    const reload = page.getByRole("button", { name: "Reload now" });
    expect((await reload.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    // "Later" puts it away
    await page.getByRole("button", { name: "Later" }).click();
    await expect(banner).toBeHidden();

    // "Reload now" reloads the page (the newer build is then served, so the notice is gone)
    await page.unroute("**/api/version");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(banner).toBeHidden();
    await context.close();
  });
}
