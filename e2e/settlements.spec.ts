import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

test.describe("a custodian is told about cash settlements to do", () => {
  let fundId: string;
  let liquidationId: string;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    const admin = await clientFor("admin");
    const custodian = await clientFor("custodian");
    const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
    fundId = fund!.id;
    await admin.rpc("set_fund_approvers", { p_fund_id: fundId, p_approver_ids: [] });
    expect((await admin.rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: true })).error).toBeNull();
    const request = await custodian.rpc("create_budget_request", { p_fund_id: fundId, p_name: "Custodian", p_amount: 900, p_purpose: `E2E settle ${Date.now()}` });
    expect((await custodian.rpc("review_budget_request", { p_id: request.data, p_approve: true, p_note: null })).error).toBeNull();
    const voucher = await custodian.rpc("save_workflow_voucher", {
      p_id: null, p_fund: fundId, p_request: request.data, p_payee: "Custodian", p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: "Supplies", amount: 900 }], p_number_mode: "none", p_number: null,
    });
    expect((await custodian.rpc("release_voucher", { p_id: voucher.data })).error).toBeNull();
    const liquidation = await custodian.rpc("create_liquidation", { p_voucher_id: voucher.data });
    liquidationId = liquidation.data as string;
    const filing = (await adminClient().from("liquidations").select("filing_date").eq("id", liquidationId).single()).data!.filing_date;
    expect((await custodian.rpc("save_liquidation", {
      p_id: liquidationId, p_department: "Ops", p_filing_date: filing,
      p_items: [{ id: crypto.randomUUID(), particulars: "Supplies", amount: 600, no_receipt_reason: "No receipt" }], p_unspent_reason: null,
    })).error).toBeNull();
    expect((await custodian.rpc("submit_liquidation", { p_id: liquidationId })).error).toBeNull();
    const owner = (await custodian.auth.getUser()).data.user!.id;
    expect((await adminClient().from("liquidations").update({ status: "approved", reviewed_by: owner, reviewer_name: "Custodian", reviewed_at: new Date().toISOString() }).eq("id", liquidationId)).error).toBeNull();
  });

  test.afterAll(async () => {
    await (await clientFor("admin")).rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: false });
  });

  test("the dashboard banner, the menu badge and the settlements page all point at it", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "1 cash settlement to do" })).toBeVisible();
    await expect(page.getByText(/Take the change back from/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Cash settlements/ }).first()).toContainText("1");

    await page.locator("a", { hasText: "See all" }).first().click();
    await expect(page).toHaveURL(/\/settlements$/);
    await expect(page.getByRole("heading", { name: "To do now (1)" })).toBeVisible();
    await page.locator("a", { hasText: "Record it" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/liquidations/${liquidationId}$`));
    await expect(page.getByRole("button", { name: "Record cash received back" })).toBeVisible();
  });
});
