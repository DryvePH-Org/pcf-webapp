import { expect, test, type Browser } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor, type Role } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop side menu.");

async function pageAs(browser: Browser, role: Role, baseURL: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await cookiesFor(role, baseURL));
  return context.newPage();
}

test.describe("menu indicators", () => {
  let adminId: string;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    await adminClient().from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    adminId = (await (await clientFor("admin")).auth.getUser()).data.user!.id;
  });

  test("news shows in blue and goes away once the page is opened, work stays", async ({ browser, baseURL }) => {
    const db = adminClient();
    const { data: fund } = await db.from("funds").select("id").eq("name", "Main Petty Cash").single();
    await (await clientFor("admin")).rpc("set_fund_self_approval", { p_fund_id: fund!.id, p_allowed: false });

    // news: a status change to look at; and an "action" notification, which must not show as news
    await db.from("notifications").insert([
      { user_id: adminId, event: "e2e.info", title: "E2E news", link_path: "/liquidations", tone: "info" },
      { user_id: adminId, event: "e2e.action", title: "E2E action", link_path: "/vouchers", tone: "action" },
    ]);
    // work: a budget request that waits for the administrator
    const custodian = await clientFor("custodian");
    const made = await custodian.rpc("create_budget_request", { p_fund_id: fund!.id, p_amount: 321, p_name: "E2E Custodian", p_purpose: `E2E menu ${Date.now()}` });
    expect(made.error).toBeNull();

    const page = await pageAs(browser, "admin", baseURL!);
    await page.goto("/dashboard");
    const liquidations = page.getByRole("link", { name: /^Liquidations/ });
    await expect(liquidations.getByLabel("1 new to see")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: /^Vouchers/ }).getByLabel(/new to see/)).toHaveCount(0);
    const requests = page.getByRole("link", { name: /^Budget requests/ });
    await expect(requests.getByLabel(/waiting for you/)).toBeVisible();

    // opening the page clears the news; the request still waits
    await liquidations.click();
    await page.waitForURL(/\/liquidations/);
    await expect(liquidations.getByLabel(/new to see/)).toHaveCount(0, { timeout: 15000 });
    await expect.poll(async () => {
      const { data } = await db.from("notifications").select("read_at").eq("user_id", adminId).eq("event", "e2e.info").single();
      return data?.read_at ? "read" : "unread";
    }).toBe("read");
    await requests.click();
    await page.waitForURL(/\/requests/);
    await expect(requests.getByLabel(/waiting for you/)).toBeVisible();
    // the action notification was not touched
    const { data: action } = await db.from("notifications").select("read_at").eq("user_id", adminId).eq("event", "e2e.action").single();
    expect(action?.read_at).toBeNull();
  });
});
