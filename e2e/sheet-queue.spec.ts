import { expect, test, type Browser } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor, type Role } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

async function pageAs(browser: Browser, role: Role, baseURL: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addCookies(await cookiesFor(role, baseURL));
  return context.newPage();
}

test.describe("the sheet queue page (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let fundId: string;
  let liquidationId: string;
  let operationId: string;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    const admin = await clientFor("admin");
    const custodian = await clientFor("custodian");
    const custodianId = (await custodian.auth.getUser()).data.user!.id;
    const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
    fundId = fund!.id;
    await admin.rpc("set_fund_approvers", { p_fund_id: fundId, p_approver_ids: [] });
    // the custodian files it and may not review it: the administrator must
    expect((await admin.rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: false })).error).toBeNull();
    // the workbook is assigned to the custodian, not to the administrator
    expect((await admin.rpc("configure_sheet_workbook", { p_id: "dryve", p_custodian: custodianId, p_fund: fundId, p_sheet: 1251133408, p_enabled: true })).error).toBeNull();

    const request = await custodian.rpc("create_budget_request", { p_fund_id: fundId, p_name: "Custodian", p_amount: 900, p_purpose: `Queue page ${Date.now()}` });
    expect(request.error).toBeNull();
    expect((await admin.rpc("review_budget_request", { p_id: request.data, p_approve: true, p_note: null })).error).toBeNull();
    const voucher = await admin.rpc("save_workflow_voucher", {
      p_id: null, p_fund: fundId, p_request: request.data, p_payee: "Custodian", p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: "Supplies", amount: 900 }], p_number_mode: "none", p_number: null,
    });
    expect(voucher.error).toBeNull();
    expect((await admin.rpc("release_voucher", { p_id: voucher.data })).error).toBeNull();
    const liquidation = await custodian.rpc("create_liquidation", { p_voucher_id: voucher.data });
    expect(liquidation.error).toBeNull();
    liquidationId = liquidation.data as string;
    const filing = (await adminClient().from("liquidations").select("filing_date").eq("id", liquidationId).single()).data!.filing_date;
    expect((await custodian.rpc("save_liquidation", {
      p_id: liquidationId, p_department: "Ops", p_filing_date: filing,
      p_items: [{ id: crypto.randomUUID(), particulars: "Supplies", amount: 600, no_receipt_reason: "No receipt" }], p_unspent_reason: null,
    })).error).toBeNull();
    expect((await custodian.rpc("submit_liquidation", { p_id: liquidationId })).error).toBeNull();
  });

  test.afterAll(async () => {
    const admin = await clientFor("admin");
    await admin.rpc("configure_sheet_workbook", { p_id: "dryve", p_custodian: null, p_fund: null, p_sheet: 1251133408, p_enabled: false });
  });


  test("an administrator and the fund's custodian see a stopped job and can retry it; accounting cannot open the page", async ({ browser, baseURL }) => {
    const spreadsheet = (await adminClient().from("sheet_workbooks").select("spreadsheet_id").eq("id", "dryve").single()).data!.spreadsheet_id;
    operationId = crypto.randomUUID();
    const saved = await adminClient().from("grokbot_operations").insert({
      id: operationId, kind: "liquidation_approved", status: "failed", spreadsheet_id: spreadsheet, sheet_id: 1251133408,
      callback_hash: "a".repeat(64), payload: {}, liquidation_id: liquidationId, error: "The Grokbot did not start this job after three tries.",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(saved.error).toBeNull();

    const custodian = await pageAs(browser, "custodian", baseURL!);
    await custodian.goto("/sheet-queue");
    await expect(custodian.getByRole("heading", { name: "Sheet queue" })).toBeVisible();
    await expect(custodian.getByText("Needs attention").first()).toBeVisible();
    await expect(custodian.getByRole("link", { name: "Sheet queue" }).first()).toBeVisible();

    const accounting = await pageAs(browser, "accounting", baseURL!);
    await accounting.goto("/sheet-queue");
    await expect(accounting.getByRole("heading", { name: "Sheet queue" })).toHaveCount(0);

    const admin = await pageAs(browser, "admin", baseURL!);
    await admin.goto("/sheet-queue");
    await expect(admin.getByText("Needs attention").first()).toBeVisible();
    await admin.getByRole("button", { name: "Retry" }).first().click();
    await expect.poll(async () => (await adminClient().from("grokbot_operations").select("status").eq("id", operationId).single()).data?.status, { timeout: 20000 }).not.toBe("failed");
  });

  test.afterAll(async () => {
    // the retry put it back in the queue (and the dispatcher may have started it); stop it before removing it
    await adminClient().from("grokbot_operations").update({ status: "failed" }).eq("id", operationId);
    await adminClient().from("grokbot_operations").delete().eq("id", operationId);
    const admin = await clientFor("admin");
    await admin.rpc("configure_sheet_workbook", { p_id: "dryve", p_custodian: null, p_fund: null, p_sheet: 1251133408, p_enabled: false });
  });
});
