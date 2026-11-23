import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

const FUND = "Scope Test";

async function removeTestFund() {
  const db = adminClient();
  const { data: funds } = await db.from("funds").select("id").eq("name", FUND);
  for (const { id } of funds ?? []) {
    for (const table of ["fund_counters", "fund_custodians", "fund_approvers", "fund_expense_tags"]) await db.from(table).delete().eq("fund_id", id);
    await db.from("funds").delete().eq("id", id);
  }
}

test.describe("a replenishment report says what it covers (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let fundId = "";
  let replenishmentId = "";

  // one approved, exactly-spent liquidation, made as the employee (accounting) and reviewed by the custodian
  async function approvedLiquidation(purpose: string, amount: number) {
    const employee = await clientFor("accounting");
    const custodian = await clientFor("custodian");
    const request = await employee.rpc("create_budget_request", { p_fund_id: fundId, p_name: "Employee", p_amount: amount, p_purpose: purpose });
    expect(request.error).toBeNull();
    expect((await custodian.rpc("review_budget_request", { p_id: request.data, p_approve: true, p_note: null })).error).toBeNull();
    const voucher = await custodian.rpc("save_workflow_voucher", {
      p_id: null, p_fund: fundId, p_request: request.data, p_payee: "Employee", p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: purpose, amount }], p_number_mode: "none", p_number: null,
    });
    expect(voucher.error).toBeNull();
    expect((await custodian.rpc("release_voucher", { p_id: voucher.data })).error).toBeNull();
    const liquidation = await employee.rpc("create_liquidation", { p_voucher_id: voucher.data });
    expect(liquidation.error).toBeNull();
    const today = new Date().toISOString().slice(0, 10);
    const saved = await employee.rpc("save_liquidation", {
      p_id: liquidation.data, p_department: "Ops", p_filing_date: today, p_unspent_reason: null,
      p_items: [{ id: crypto.randomUUID(), particulars: purpose, amount, no_receipt_reason: "No receipt" }],
    });
    expect(saved.error).toBeNull();
    expect((await employee.rpc("submit_liquidation", { p_id: liquidation.data })).error).toBeNull();
    const row = await adminClient().from("liquidations").select("receipt_review_revision").eq("id", liquidation.data).single();
    const lines = [{ particulars: purpose, amount, supplier: "Shop", tin: "111", tag: "MEALS", expense_date: today, plate: "N/A", receipt_number: "OR-1", physical_checked: true, receipt_path: "" }];
    const reviewed = await custodian.rpc("save_custodian_receipts", { p_id: liquidation.data, p_revision: (row.data as { receipt_review_revision: number }).receipt_review_revision, p_lines: lines });
    expect(reviewed.error).toBeNull();
    expect((await custodian.rpc("approve_liquidation_without_sheet", { p_id: liquidation.data })).error).toBeNull();
  }

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    await removeTestFund();
    const db = adminClient();
    const created = await db.from("funds").insert({ name: FUND, amount: 20000, per_txn_limit: 5000, approval_threshold: 9000, sheet_ledger: false }).select("id").single();
    expect(created.error).toBeNull();
    fundId = created.data!.id as string;
    const admin = await clientFor("admin");
    const custodian = await clientFor("custodian");
    expect((await admin.rpc("set_fund_custodians", { p_fund_id: fundId, p_custodian_ids: [(await custodian.auth.getUser()).data.user!.id] })).error).toBeNull();
    expect((await admin.rpc("set_fund_expense_tags", { p_fund: fundId, p_tags: ["MEALS"] })).error).toBeNull();
    await approvedLiquidation(`First batch ${Date.now()}`, 700);
    const replenishment = await custodian.rpc("create_replenishment", { p_fund_id: fundId });
    expect(replenishment.error).toBeNull();
    replenishmentId = replenishment.data as string;
    // an expense approved after the replenishment was prepared belongs to the next one
    await approvedLiquidation(`Second batch ${Date.now()}`, 300);
  });
  test.afterAll(async () => {
    await cleanTestData();
    await removeTestFund();
  });

  test("the report says what it covers, what is not in it, and why the ledger can show more", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("admin", baseURL!));
    const page = await context.newPage();
    await page.goto(`/replenishments/${replenishmentId}`, { waitUntil: "networkidle" });
    await expect(page.getByText("What this report covers").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/This report covers the 1 expense on 1 voucher/).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("₱700.00 is the amount this replenishment replaces.").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/1 liquidation totalling ₱300.00/).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/Google Sheet and the Accounting page count everything/).filter({ visible: true }).first()).toBeVisible();
    // the category block says expenses, not vouchers
    await expect(page.getByText("1 expense", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await context.close();
  });

  test("after the approver approves, the page says the budget comes back at the cash handover, and it does", async ({ browser, baseURL }) => {
    const custodian = await clientFor("custodian");
    const accounting = await clientFor("accounting");
    const admin = await clientFor("admin");
    expect((await custodian.rpc("submit_replenishment", { p_id: replenishmentId })).error).toBeNull();
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("admin", baseURL!));
    const page = await context.newPage();
    await page.goto(`/replenishments/${replenishmentId}`, { waitUntil: "networkidle" });
    await expect(page.getByText("Waiting for Accounting's review")).toBeVisible();

    expect((await accounting.rpc("review_replenishment", { p_id: replenishmentId, p_approve: true })).error).toBeNull();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("Accounting approved. Waiting for the approver")).toBeVisible();

    expect((await admin.rpc("approve_replenishment", { p_id: replenishmentId, p_approve: true, p_note: null })).error).toBeNull();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("Approved. Next: confirm the cash was handed to the custodian")).toBeVisible();
    // approved, but the budget has not come back yet
    const before = await adminClient().from("fund_balance_v").select("expected_cash, fund_amount").eq("fund_id", fundId).single();
    expect(Number(before.data!.expected_cash)).toBeLessThan(Number(before.data!.fund_amount));

    // Accounting confirms the handover in the app: the day and the amount, and a different amount needs a reason
    await page.getByRole("button", { name: "Confirm cash handed to custodian" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Day the cash was handed over")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await expect(dialog.getByLabel("Amount handed over (₱)")).toHaveValue("700.00");
    await dialog.getByLabel("Amount handed over (₱)").fill("650");
    await expect(dialog.getByText("Why is it different from ₱700.00?")).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm cash handed over" }).click();
    await expect(dialog.getByText("Explain why the amount is different from the approved amount.")).toBeVisible();
    await dialog.getByLabel(/Why is it different/).fill("PHP 50 kept for the bank fee");
    await dialog.getByRole("button", { name: "Confirm cash handed over" }).click();
    await expect(page.getByText("Replenishment closed. The fund is restored.")).toBeVisible();

    // the first batch's cash is back (the second batch is still out), and the timeline says what happened
    const after = await adminClient().from("fund_balance_v").select("expected_cash").eq("fund_id", fundId).single();
    expect(Number(after.data!.expected_cash)).toBeGreaterThan(Number(before.data!.expected_cash));
    const row = await adminClient().from("replenishments").select("status, handed_over_amount, handover_note, handed_over_on").eq("id", replenishmentId).single();
    expect(row.data).toMatchObject({ status: "closed", handed_over_amount: 650, handover_note: "PHP 50 kept for the bank fee" });
    await page.reload({ waitUntil: "networkidle" });
    const timeline = page.getByRole("list", { name: "Replenishment timeline" });
    await expect(timeline.getByText("Cash handed to the custodian")).toBeVisible();
    await expect(timeline.getByText(/₱650.00 \(approved ₱700.00: PHP 50 kept for the bank fee\)/)).toBeVisible();
    await expect(timeline.getByText("Fund budget restored in the app")).toBeVisible();
    await expect(page.getByText("Where is the money?")).toBeVisible();
    await context.close();
  });
});
