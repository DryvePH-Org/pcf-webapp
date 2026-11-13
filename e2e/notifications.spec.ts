import { expect, test, type Browser } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor, type Role } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

async function pageAs(browser: Browser, role: Role, baseURL: string, width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addCookies(await cookiesFor(role, baseURL));
  return context.newPage();
}

test.describe("the notification bell (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let requestId: string;
  let adminId: string;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    await adminClient().from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    adminId = (await (await clientFor("admin")).auth.getUser()).data.user!.id;
    await adminClient().from("notification_preferences").delete().eq("user_id", adminId);
    const admin = await clientFor("admin");
    const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
    await admin.rpc("set_fund_approvers", { p_fund_id: fund!.id, p_approver_ids: [] });
    await admin.rpc("set_fund_self_approval", { p_fund_id: fund!.id, p_allowed: false });
  });

  test("a request stores a notification for its reviewer", async ({ browser, baseURL }) => {
    const page = await pageAs(browser, "custodian", baseURL!);
    await page.goto("/requests/new");
    await page.getByLabel(/^Budget needed/).fill("400");
    await page.getByLabel(/^What is the budget for/).fill(`E2E bell ${Date.now()}`);
    const fund = page.getByRole("combobox", { name: /Fund/ });
    if ((await fund.textContent())?.includes("Choose")) {
      await fund.click();
      await page.getByRole("option").nth(1).click();
    }
    await page.getByRole("button", { name: "Submit budget request" }).click();
    await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/);
    requestId = page.url().split("/").pop()!;

    // The notification is written after the response, so give it a moment.
    await expect.poll(async () => {
      const { data } = await adminClient().from("notifications").select("id").eq("user_id", adminId).eq("entity_id", requestId);
      return data?.length ?? 0;
    }, { timeout: 15000 }).toBeGreaterThan(0);
  });

  test("the reviewer sees it in the bell, opens it, and it is marked read", async ({ browser, baseURL }) => {
    const page = await pageAs(browser, "admin", baseURL!);
    await page.goto("/dashboard");
    const bell = page.getByRole("button", { name: /Notifications, \d+ unread/ });
    await expect(bell).toBeVisible({ timeout: 15000 });
    await bell.click();
    await expect(page.getByText("Budget request needs your review").first()).toBeVisible();
    await page.getByRole("menuitem", { name: /Budget request needs your review/ }).first().click();
    await page.waitForURL(new RegExp(`/requests/${requestId}$`));

    await expect.poll(async () => {
      const { data } = await adminClient().from("notifications").select("read_at").eq("user_id", adminId).eq("entity_id", requestId);
      return data?.[0]?.read_at ? "read" : "unread";
    }, { timeout: 10000 }).toBe("read");
  });

  test("the notifications page lists it and saves email choices", async ({ browser, baseURL }) => {
    const page = await pageAs(browser, "admin", baseURL!);
    await page.goto("/notifications");
    await expect(page.getByText("Budget request needs your review").first()).toBeVisible();
    await page.getByLabel(/Email me when something needs me/).uncheck();
    await page.getByRole("button", { name: "Save email settings" }).click();
    await expect(page.getByText("Email settings saved")).toBeVisible();
    const { data } = await adminClient().from("notification_preferences").select("email_actions, email_digest").eq("user_id", adminId).single();
    expect(data).toEqual({ email_actions: false, email_digest: true });
  });
});

test.describe("the bell on a phone", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, "Phone layout only.");
  test("the bell sits in the top bar and the page fits the screen", async ({ browser, baseURL }) => {
    const page = await pageAs(browser, "admin", baseURL!, 390);
    await page.goto("/dashboard");
    const bell = page.getByRole("button", { name: /^Notifications/ });
    await expect(bell).toBeVisible({ timeout: 15000 });
    // Opening it must show the menu (it used to crash and stay empty).
    await bell.click();
    await expect(page.getByRole("menuitem", { name: "See all notifications" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto("/notifications");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
