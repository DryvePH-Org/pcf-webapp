import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

test.describe("cancelling an advance that was never used (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let fundId: string;
  let requestId: string;
  let voucherId: string;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    const admin = await clientFor("admin");
    const custodian = await clientFor("custodian");
    const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
    fundId = fund!.id;
    await admin.rpc("set_fund_approvers", { p_fund_id: fundId, p_approver_ids: [] });
    expect((await admin.rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: true })).error).toBeNull();
    const request = await custodian.rpc("create_budget_request", { p_fund_id: fundId, p_name: "Custodian", p_amount: 800, p_purpose: `E2E cancel ${Date.now()}` });
    requestId = request.data as string;
    expect((await custodian.rpc("review_budget_request", { p_id: requestId, p_approve: true, p_note: null })).error).toBeNull();
    const voucher = await custodian.rpc("save_workflow_voucher", {
      p_id: null, p_fund: fundId, p_request: requestId, p_payee: "Custodian", p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: "Supplies", amount: 800 }], p_number_mode: "none", p_number: null,
    });
    voucherId = voucher.data as string;
    expect((await custodian.rpc("release_voucher", { p_id: voucherId })).error).toBeNull();
  });

  test.afterAll(async () => {
    await (await clientFor("admin")).rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: false });
  });

  test("the custodian cancels it with the cash still out, then records the return", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(`/vouchers/${voucherId}`);

    await expect(page.getByText("Was this cash not used?")).toBeVisible();
    await page.getByRole("button", { name: /Cancel — advance not used/ }).click();
    const dialog = page.getByRole("dialog");
    // Nothing is sent until every question is answered.
    await dialog.getByRole("button", { name: "Cancel advance" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Choose why");
    await dialog.getByLabel("The plan changed").check();
    await dialog.getByLabel(/Not back yet/).check();
    await expect(dialog.getByText("pending", { exact: false }).first()).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel advance" }).click();

    await expect(page.getByText("Advance cancelled. Cash return pending.")).toBeVisible();
    await expect(page.getByText("Advance not used").first()).toBeVisible();
    const { data: request } = await adminClient().from("budget_requests").select("status").eq("id", requestId).single();
    expect(request!.status).toBe("cancelled");
    const { data: balance } = await adminClient().from("fund_balance_v").select("returns_due").eq("fund_id", fundId).single();
    expect(Number(balance!.returns_due)).toBe(800);

    await page.getByRole("button", { name: "Record cash returned" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Record return" }).click();
    await expect(page.getByText("Advance not used. Cash returned.")).toBeVisible();
    const { data: after } = await adminClient().from("fund_balance_v").select("returns_due, released_vouchers_total").eq("fund_id", fundId).single();
    expect(Number(after!.returns_due)).toBe(0);
    expect(Number(after!.released_vouchers_total)).toBe(0);
  });
});
