import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

const FUND = "Filing For Test";

async function removeTestFund() {
  const db = adminClient();
  const { data: funds } = await db.from("funds").select("id").eq("name", FUND);
  for (const { id } of funds ?? []) {
    for (const table of ["fund_counters", "fund_custodians", "fund_approvers", "fund_expense_tags"]) {
      const { error } = await db.from(table).delete().eq("fund_id", id);
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    const { error } = await db.from("funds").delete().eq("id", id);
    if (error) throw new Error(`funds: ${error.message}`);
  }
}

// An employee who cannot use the website gets cash; the fund's custodian files the liquidation for them.
test.describe("a custodian files the liquidation for an employee (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let voucherId: string;
  let liquidationId: string;
  let employeeId: string;
  let custodianId: string;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    await removeTestFund();
    const db = adminClient();
    const created = await db.from("funds").insert({ name: FUND, amount: 5000, per_txn_limit: 1000, approval_threshold: 3000, sheet_ledger: false }).select("id").single();
    expect(created.error).toBeNull();
    const fundId = created.data!.id as string;
    const admin = await clientFor("admin");
    const custodian = await clientFor("custodian");
    const employee = await clientFor("accounting");
    custodianId = (await custodian.auth.getUser()).data.user!.id;
    employeeId = (await employee.auth.getUser()).data.user!.id;
    expect((await admin.rpc("set_fund_custodians", { p_fund_id: fundId, p_custodian_ids: [custodianId] })).error).toBeNull();
    expect((await admin.rpc("set_fund_expense_tags", { p_fund: fundId, p_tags: ["MEALS"] })).error).toBeNull();
    // the employee asks; the custodian approves, prepares the voucher and releases the cash
    const request = await employee.rpc("create_budget_request", { p_fund_id: fundId, p_name: "Employee", p_amount: 900, p_purpose: `Filed for ${Date.now()}` });
    expect(request.error).toBeNull();
    expect((await custodian.rpc("review_budget_request", { p_id: request.data, p_approve: true, p_note: null })).error).toBeNull();
    const voucher = await custodian.rpc("save_workflow_voucher", {
      p_id: null, p_fund: fundId, p_request: request.data, p_payee: "Employee", p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: "Supplies", amount: 900 }], p_number_mode: "none", p_number: null,
    });
    expect(voucher.error).toBeNull();
    voucherId = voucher.data as string;
    expect((await custodian.rpc("release_voucher", { p_id: voucherId })).error).toBeNull();
  });

  test.afterAll(async () => {
    await cleanTestData();
    await adminClient().from("notifications").delete().in("event", ["liquidation.filed_for_you", "audit.self_approval"]);
    await removeTestFund();
  });

  test("the custodian files it, fills it in and submits", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(`/vouchers/${voucherId}`);
    await expect(page.getByText("you can file the liquidation for them")).toBeVisible();
    await page.getByRole("button", { name: /File liquidation for/ }).click();
    await page.waitForURL(/\/liquidations\//);
    liquidationId = page.url().split("/liquidations/")[1].split(/[?#]/)[0];

    await expect(page.getByText("You are filling this out for")).toBeVisible();
    await page.getByLabel("Amount actually spent (₱)").fill("900");
    await page.locator("#liquidation-department").fill("Operations");
    await page.getByRole("button", { name: "Submit for review", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Submitted to the custodian")).toBeVisible();

    const saved = await adminClient().from("liquidations").select("owner_id, filed_by, status, department, total_spent").eq("id", liquidationId).single();
    expect(saved.data).toMatchObject({ owner_id: employeeId, filed_by: custodianId, status: "submitted", department: "Operations", total_spent: 900 });

    // the page says who filed it, and the custodian who filed it can review it herself
    await page.reload();
    await expect(page.getByText(/Filed by .* for /)).toBeVisible();
    await expect(page.getByText("This liquidation needs your review")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save receipt review" })).toBeVisible();
    await context.close();
  });

  test("the employee is told; the custodian who filed it reviews and approves it, on record", async ({ browser, baseURL }) => {
    // told in the app
    await expect
      .poll(async () => (await adminClient().from("notifications").select("id").eq("user_id", employeeId).eq("event", "liquidation.filed_for_you")).data?.length ?? 0, { timeout: 15000 })
      .toBeGreaterThan(0);
    const employeePage = await (async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
      await context.addCookies(await cookiesFor("accounting", baseURL!));
      return { context, page: await context.newPage() };
    })();
    await employeePage.page.goto(`/liquidations/${liquidationId}`);
    await expect(employeePage.page.getByText(/This was filed for you/)).toBeVisible();
    await employeePage.context.close();

    // the custodian who filed it does the receipt review and approves it herself
    const custodian = await clientFor("custodian");
    const revision = (await adminClient().from("liquidations").select("receipt_review_revision").eq("id", liquidationId).single()).data!.receipt_review_revision;
    const lines = [{ particulars: "Supplies", amount: 900, supplier: "N/A", tin: "N/A", tag: "MEALS", expense_date: new Date().toISOString().slice(0, 10), plate: "N/A", receipt_number: "", physical_checked: true, receipt_path: "" }];
    expect((await custodian.rpc("save_custodian_receipts", { p_id: liquidationId, p_revision: revision, p_lines: lines })).error).toBeNull();
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(`/liquidations/${liquidationId}`);
    await page.getByRole("button", { name: "Approve liquidation" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Liquidation approved")).toBeVisible();
    const approved = await adminClient().from("liquidations").select("status, filed_by, reviewed_by").eq("id", liquidationId).single();
    expect(approved.data).toMatchObject({ status: "approved", filed_by: custodianId, reviewed_by: custodianId });
    await context.close();

    // it is on record, and administrators are told
    const audit = await adminClient().from("audit_log").select("new_data").eq("entity_type", "liquidations").eq("entity_id", liquidationId).eq("action", "self_approval");
    expect(audit.data?.some((row) => (row.new_data as { step?: string }).step === "filed_and_reviewed_by_same_custodian")).toBe(true);
    await expect
      .poll(async () => (await adminClient().from("notifications").select("id").eq("event", "audit.self_approval").eq("entity_id", liquidationId)).data?.length ?? 0, { timeout: 15000 })
      .toBeGreaterThan(0);
  });
});
