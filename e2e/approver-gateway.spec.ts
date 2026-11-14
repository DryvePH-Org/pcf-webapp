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

// A fund with an assigned approver, once with self-approval off and once with it on.
for (const selfApproval of [false, true]) {
  test.describe(`the assigned approver reviews a custodian's own request and liquidation, self-approval ${selfApproval ? "on" : "off"} (desktop)`, () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
    let fundId: string;
    let approverId: string;
    let requestId: string;
    let liquidationId: string;

    test.beforeAll(async () => {
      assertSafeTarget();
      await cleanTestData();
      const admin = await clientFor("admin");
      const custodian = await clientFor("custodian");
      const approver = await clientFor("approver");
      approverId = (await approver.auth.getUser()).data.user!.id;
      const custodianId = (await custodian.auth.getUser()).data.user!.id;
      const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
      fundId = fund!.id;
      expect((await admin.rpc("set_fund_approvers", { p_fund_id: fundId, p_approver_ids: [approverId] })).error).toBeNull();
      expect((await admin.rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: selfApproval })).error).toBeNull();
      expect((await admin.rpc("configure_sheet_workbook", {
        p_id: "dryve", p_custodian: custodianId, p_fund: fundId, p_sheet: 1251133408, p_enabled: true,
      })).error).toBeNull();
      const request = await custodian.rpc("create_budget_request", {
        p_fund_id: fundId, p_name: "Custodian", p_amount: 900, p_purpose: `E2E approver ${selfApproval} ${Date.now()}`,
      });
      expect(request.error).toBeNull();
      requestId = request.data as string;
    });

    test.afterAll(async () => {
      const admin = await clientFor("admin");
      await admin.rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: false });
      await admin.rpc("set_fund_approvers", { p_fund_id: fundId, p_approver_ids: [] });
      await admin.rpc("configure_sheet_workbook", { p_id: "dryve", p_custodian: null, p_fund: null, p_sheet: 1251133408, p_enabled: false });
    });

    test("the approver approves the request and can prepare its voucher", async ({ browser, baseURL }) => {
      const page = await pageAs(browser, "approver", baseURL!);
      await page.goto(`/requests/${requestId}`);
      await expect(page.getByText("This request needs your review")).toBeVisible();
      await page.getByRole("button", { name: "Approve request" }).click();
      await page.getByRole("dialog").getByRole("button", { name: /^Approve/ }).click();
      await expect(page.getByText(/Approved\. Next: create the voucher/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Create linked voucher" })).toBeVisible();

      // She prepares and releases the voucher, and the custodian files her liquidation.
      const approver = await clientFor("approver");
      const voucher = await approver.rpc("save_workflow_voucher", {
        p_id: null, p_fund: fundId, p_request: requestId, p_payee: "Custodian", p_date: new Date().toISOString().slice(0, 10),
        p_items: [{ particulars: "Supplies", amount: 900 }], p_number_mode: "none", p_number: null,
      });
      expect(voucher.error).toBeNull();
      expect((await approver.rpc("release_voucher", { p_id: voucher.data })).error).toBeNull();
      const custodian = await clientFor("custodian");
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

    test("the approver reviews and approves the custodian's own liquidation", async ({ browser, baseURL }) => {
      const page = await pageAs(browser, "approver", baseURL!);
      await page.goto(`/liquidations/${liquidationId}`);
      await expect(page.getByText("Custodian receipt review")).toBeVisible();
      await expect(page.getByRole("button", { name: "Flag for correction" })).toBeVisible();

      await page.getByRole("combobox", { name: "Expense type" }).first().click();
      await page.getByRole("option", { name: "MEALS" }).click();
      await page.getByLabel(/^Supplier$/).first().fill("TEST SUPPLIER");
      await page.getByLabel(/^Supplier TIN or NON VAT$/).first().fill("N/A");
      await page.getByRole("checkbox").first().check();
      await page.getByRole("button", { name: "Save receipt review" }).click();
      await expect(page.getByText(/Receipt review saved|Review saved/)).toBeVisible();

      await page.getByRole("button", { name: "Review and approve liquidation" }).click();
      await expect(page.getByText("Confirm Google Sheets update")).toBeVisible();
      await page.getByRole("button", { name: "Approve and update Google Sheets" }).click();
      await expect(page.getByText(/Liquidation approved/).first()).toBeVisible();

      const { data } = await adminClient().from("liquidations").select("status, reviewed_by").eq("id", liquidationId).single();
      expect(data).toEqual({ status: "approved", reviewed_by: approverId });
    });

    test("the approver can record the cash settlement", async ({ browser, baseURL }) => {
      const page = await pageAs(browser, "approver", baseURL!);
      await page.goto(`/liquidations/${liquidationId}`);
      await page.getByRole("button", { name: /Record cash received back/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: /^Confirm|Record/ }).click();
      await expect.poll(async () => {
        const { data } = await adminClient().from("cash_settlements").select("kind").eq("liquidation_id", liquidationId);
        return data?.length ?? 0;
      }, { timeout: 10000 }).toBe(1);
    });
  });
}
