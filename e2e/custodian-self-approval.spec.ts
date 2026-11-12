import { expect, test, type Browser } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor, type Role } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

async function pageAs(browser: Browser, role: Role, baseURL: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await cookiesFor(role, baseURL));
  return context.newPage();
}

test.describe("a fund that lets the custodian approve her own request (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let fundId: string;
  let requestId: string;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
    fundId = fund!.id;
    const admin = await clientFor("admin");
    await admin.rpc("set_fund_approvers", { p_fund_id: fundId, p_approver_ids: [] });
    const { error } = await admin.rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: true });
    expect(error).toBeNull();
  });

  test.afterAll(async () => {
    await (await clientFor("admin")).rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: false });
  });

  test("the custodian approves her own request and it is audited", async ({ browser, baseURL }) => {
    const page = await pageAs(browser, "custodian", baseURL!);
    await page.goto("/requests/new");
    await page.getByLabel(/^Budget needed/).fill("650");
    await page.getByLabel(/^What is the budget for/).fill(`E2E self approval ${Date.now()}`);
    const fund = page.getByRole("combobox", { name: /Fund/ });
    if ((await fund.textContent())?.includes("Choose")) {
      await fund.click();
      await page.getByRole("option").nth(1).click();
    }
    await expect(page.getByText(/lets you approve your own request/i)).toBeVisible();
    await page.getByRole("button", { name: "Submit budget request" }).click();
    await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/);
    requestId = page.url().split("/").pop()!;

    await expect(page.getByText("This request needs your review")).toBeVisible();
    await page.getByRole("button", { name: "Approve request" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Approve/ }).click();
    await expect(page.getByText(/Approved\. Next: create the voucher/)).toBeVisible();
    await expect(page.getByText(/self-approved/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Create linked voucher" })).toBeVisible();

    const { data } = await adminClient()
      .from("audit_log")
      .select("id")
      .eq("action", "self_approval")
      .eq("entity_id", requestId);
    expect(data?.length).toBe(1);
  });

  test("an administrator sees the setting on the fund page", async ({ browser, baseURL }) => {
    const page = await pageAs(browser, "admin", baseURL!);
    await page.goto("/funds");
    await expect(page.getByText(/approve their own budget request and liquidation/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn off self-approval" }).first()).toBeVisible();
  });
});
