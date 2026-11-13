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

test.describe("a custodian approves her own liquidation (desktop)", () => {
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
    expect((await admin.rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: true })).error).toBeNull();
    const configured = await admin.rpc("configure_sheet_workbook", {
      p_id: "dryve", p_custodian: custodianId, p_fund: fundId, p_sheet: 1251133408, p_enabled: true,
    });
    expect(configured.error).toBeNull();

    const request = await custodian.rpc("create_budget_request", { p_fund_id: fundId, p_name: "Custodian", p_amount: 900, p_purpose: `Dryve company ${Date.now()}` });
    expect(request.error).toBeNull();
    expect((await custodian.rpc("review_budget_request", { p_id: request.data, p_approve: true, p_note: null })).error).toBeNull();
    const voucher = await custodian.rpc("save_workflow_voucher", {
      p_id: null, p_fund: fundId, p_request: request.data, p_payee: "Custodian", p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: "Supplies", amount: 900 }], p_number_mode: "none", p_number: null,
    });
    expect(voucher.error).toBeNull();
    expect((await custodian.rpc("release_voucher", { p_id: voucher.data })).error).toBeNull();
    const liquidation = await custodian.rpc("create_liquidation", { p_voucher_id: voucher.data });
    expect(liquidation.error).toBeNull();
    liquidationId = liquidation.data as string;
    const filing = (await adminClient().from("liquidations").select("filing_date").eq("id", liquidationId).single()).data!.filing_date;
    const lineId = crypto.randomUUID();
    expect((await custodian.rpc("save_liquidation", {
      p_id: liquidationId, p_department: "Ops", p_filing_date: filing,
      p_items: [{ id: lineId, particulars: "Supplies", amount: 600, no_receipt_reason: "No receipt" }], p_unspent_reason: null,
    })).error).toBeNull();
    expect((await custodian.rpc("submit_liquidation", { p_id: liquidationId })).error).toBeNull();
  });

  test.afterAll(async () => {
    const admin = await clientFor("admin");
    await admin.rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: false });
    await admin.rpc("configure_sheet_workbook", { p_id: "dryve", p_custodian: null, p_fund: null, p_sheet: 1251133408, p_enabled: false });
  });

  test("she reviews it, approves it herself, and it is audited", async ({ browser, baseURL }) => {
    const page = await pageAs(browser, "custodian", baseURL!);
    await page.goto(`/liquidations/${liquidationId}`);

    // The review form and the approval button are offered to her on her own liquidation.
    await expect(page.getByText("Custodian receipt review")).toBeVisible();
    await expect(page.getByRole("button", { name: "Flag for correction" })).toBeVisible();

    await page.getByRole("combobox", { name: "Expense type" }).first().click();
    await page.getByRole("option", { name: "MEALS" }).click();
    await page.getByLabel(/^Supplier$/).first().fill("TEST SUPPLIER");
    await page.getByLabel(/^Supplier TIN or NON VAT$/).first().fill("N/A");
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "Save receipt review" }).click();
    await expect(page.getByText(/Receipt review saved|Review saved/)).toBeVisible();

    // The approval preview opens for her (it used to say the liquidation was unavailable).
    await page.getByRole("button", { name: "Review and approve liquidation" }).click();
    await expect(page.getByText("Confirm Google Sheets update")).toBeVisible();
    await expect(page.getByText(/Company: DRYVE/)).toBeVisible();
    await page.getByRole("button", { name: "Approve and update Google Sheets" }).click();
    await expect(page.getByText(/Liquidation approved/).first()).toBeVisible();

    const { data: liquidation } = await adminClient().from("liquidations").select("status, reviewed_by, owner_id").eq("id", liquidationId).single();
    expect(liquidation?.status).toBe("approved");
    expect(liquidation?.reviewed_by).toBe(liquidation?.owner_id);
    const { data: audit } = await adminClient().from("audit_log").select("new_data").eq("action", "self_approval").eq("entity_id", liquidationId);
    expect(audit?.some((row) => (row.new_data as { step?: string })?.step === "liquidation_review")).toBe(true);
  });

  test("where the fund does not allow it, the owner still cannot review her own liquidation", async () => {
    const admin = await clientFor("admin");
    await admin.rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: false });
    const custodian = await clientFor("custodian");
    const { error } = await custodian.rpc("review_liquidation", { p_id: liquidationId, p_approve: false, p_note: "no" });
    expect(error?.message).toMatch(/Only submitted|cannot review your own|cannot be reviewed/i);
  });
});
