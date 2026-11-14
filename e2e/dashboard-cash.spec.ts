import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

const peso = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

test.describe("the dashboard shows the cash after pending settlements (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let fundAmount = 0;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    const admin = await clientFor("admin");
    const custodian = await clientFor("custodian");
    const { data: fund } = await adminClient().from("funds").select("id, amount").eq("name", "Main Petty Cash").single();
    fundAmount = Number(fund!.amount);
    await admin.rpc("set_fund_approvers", { p_fund_id: fund!.id, p_approver_ids: [] });
    expect((await admin.rpc("set_fund_self_approval", { p_fund_id: fund!.id, p_allowed: true })).error).toBeNull();
    const request = await custodian.rpc("create_budget_request", { p_fund_id: fund!.id, p_name: "Custodian", p_amount: 900, p_purpose: `E2E cash ${Date.now()}` });
    expect((await custodian.rpc("review_budget_request", { p_id: request.data, p_approve: true, p_note: null })).error).toBeNull();
    const voucher = await custodian.rpc("save_workflow_voucher", {
      p_id: null, p_fund: fund!.id, p_request: request.data, p_payee: "Custodian", p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: "Supplies", amount: 900 }], p_number_mode: "none", p_number: null,
    });
    expect((await custodian.rpc("release_voucher", { p_id: voucher.data })).error).toBeNull();
    const liquidation = await custodian.rpc("create_liquidation", { p_voucher_id: voucher.data });
    const filing = (await adminClient().from("liquidations").select("filing_date").eq("id", liquidation.data).single()).data!.filing_date;
    expect((await custodian.rpc("save_liquidation", {
      p_id: liquidation.data, p_department: "Ops", p_filing_date: filing,
      p_items: [{ id: crypto.randomUUID(), particulars: "Supplies", amount: 600, no_receipt_reason: "No receipt" }], p_unspent_reason: null,
    })).error).toBeNull();
    expect((await custodian.rpc("submit_liquidation", { p_id: liquidation.data })).error).toBeNull();
    // Approved by the custodian, but the ₱300 change has not been recorded as returned yet.
    const owner = (await custodian.auth.getUser()).data.user!.id;
    const approved = await adminClient().from("liquidations").update({ status: "approved", reviewed_by: owner, reviewer_name: "Custodian", reviewed_at: new Date().toISOString() }).eq("id", liquidation.data);
    expect(approved.error).toBeNull();
  });

  test.afterAll(async () => {
    const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
    await (await clientFor("admin")).rpc("set_fund_self_approval", { p_fund_id: fund!.id, p_allowed: false });
  });

  test("it shows the recorded cash and, separately, the cash once the ₱300 return is recorded", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto("/dashboard");
    const recorded = fundAmount - 900;
    await expect(page.getByText("Recorded cash on hand").first()).toBeVisible();
    await expect(page.getByText(peso(recorded)).first()).toBeVisible();
    await expect(page.getByText("Actual cash after pending settlements").first()).toBeVisible();
    await expect(page.getByText(peso(recorded + 300)).first()).toBeVisible();
    await expect(page.getByText(/cash returns due/).first()).toBeVisible();
  });
});
