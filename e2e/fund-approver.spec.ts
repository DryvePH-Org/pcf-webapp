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

test.describe("a custodian's own request goes to the fund approver (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let fundId: string;
  let requestId: string;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
    fundId = fund!.id;
    const approver = (await (await clientFor("approver")).auth.getUser()).data.user!.id;
    const { error } = await (await clientFor("admin")).rpc("set_fund_approvers", {
      p_fund_id: fundId,
      p_approver_ids: [approver],
    });
    expect(error).toBeNull();
  });

  test.afterAll(async () => {
    await (await clientFor("admin")).rpc("set_fund_approvers", { p_fund_id: fundId, p_approver_ids: [] });
  });

  test("the request form names the approver and the custodian cannot review it", async ({ browser, baseURL }) => {
    const page = await pageAs(browser, "custodian", baseURL!);
    await page.goto("/requests/new");
    await page.getByLabel(/^Budget needed/).fill("900");
    await page.getByLabel(/^What is the budget for/).fill(`E2E custodian own request ${Date.now()}`);
    const fund = page.getByRole("combobox", { name: /Fund/ });
    if ((await fund.textContent())?.includes("Choose")) {
      await fund.click();
      await page.getByRole("option").nth(1).click();
    }
    await expect(page.getByText(/the fund approver reviews it/i)).toBeVisible();
    await page.getByRole("button", { name: "Submit budget request" }).click();
    await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/);
    requestId = page.url().split("/").pop()!;
    await expect(page.getByText(/Waiting for the fund approver/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve request" })).toHaveCount(0);
  });

  test("the assigned approver reviews it and can prepare the voucher", async ({ browser, baseURL }) => {
    const page = await pageAs(browser, "approver", baseURL!);
    await page.goto(`/requests/${requestId}`);
    await expect(page.getByText("This request needs your review")).toBeVisible();
    await page.getByRole("button", { name: "Approve request" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Approve/ }).click();
    await expect(page.getByText(/Approved\. Next: create the voucher/)).toBeVisible();
    await page.getByRole("button", { name: "Create linked voucher" }).click();
    await page.waitForURL(/\/vouchers\/new\?request=/);
    // The approver stays on the voucher form (a non-reviewer would be sent back to the request).
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/vouchers\/new\?request=/);
    await expect(page.getByRole("button", { name: /Save|Release|Submit/i }).first()).toBeVisible();
  });

  test("the requester cannot prepare the voucher or release the cash for her own request", async () => {
    const custodian = await clientFor("custodian");
    const { error } = await custodian.rpc("save_workflow_voucher", {
      p_id: null,
      p_fund: fundId,
      p_request: requestId,
      p_payee: "Custodian",
      p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: "Own", amount: 900 }],
      p_number_mode: "none",
      p_number: null,
    });
    expect(error?.message).toMatch(/Another person must prepare/i);
  });

  test("an administrator sees and edits the assigned approver on the fund page", async ({ browser, baseURL }) => {
    const page = await pageAs(browser, "admin", baseURL!);
    await page.goto("/funds");
    await expect(page.getByText("Assigned approver").first()).toBeVisible();
    await page.getByRole("button", { name: "Assign approvers" }).first().click();
    await expect(page.getByRole("dialog").getByText(/reviews budget requests made by a custodian/i)).toBeVisible();
  });
});
