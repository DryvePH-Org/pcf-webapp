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

test.describe("an administrator approves a liquidation on the fund's workbook (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let fundId: string;
  let liquidationId: string;

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

    const request = await custodian.rpc("create_budget_request", { p_fund_id: fundId, p_name: "Custodian", p_amount: 900, p_purpose: `Admin approval ${Date.now()}` });
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

  test("the administrator saves the review and gets the sheet preview, not an assignment error", async ({ browser, baseURL }) => {
    const page = await pageAs(browser, "admin", baseURL!);
    await page.goto(`/liquidations/${liquidationId}`);
    await expect(page.getByText("Company charged").first()).toBeVisible();
    // the tag list comes from the fund's workbook even though it is assigned to the custodian
    await page.getByRole("combobox", { name: "Expense type" }).first().click();
    await page.getByRole("option", { name: "MEALS" }).click();
    await page.getByLabel(/^Supplier$/).first().fill("JOLLIBEE");
    await page.getByLabel(/^Supplier TIN or NON VAT$/).first().fill("NON VAT");
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "Save receipt review" }).click();
    await expect(page.getByText(/Receipt review saved|Review saved/)).toBeVisible();

    await page.getByRole("button", { name: "Review and approve liquidation" }).click();
    await expect(page.getByText("Confirm Google Sheets update")).toBeVisible();
    await expect(page.getByText(/Ask Accounting to enable a workbook/)).toHaveCount(0);
    await page.getByRole("button", { name: "Approve and update Google Sheets" }).click();
    await expect.poll(async () => (await adminClient().from("liquidations").select("status").eq("id", liquidationId).single()).data?.status, { timeout: 20000 }).toBe("approved");
  });
});
