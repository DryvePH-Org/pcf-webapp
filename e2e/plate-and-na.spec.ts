import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

const FUND = "Plate Test";

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
    expect((await admin.rpc("set_fund_custodians", { p_fund_id: fundId, p_custodian_ids: [(await custodian.auth.getUser()).data.user!.id] })).error).toBeNull();
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

  let formUrl = "";

  test("one plate at the top fills every particular; a different plate stays with its particular", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(`/vouchers/${voucherId}`);
    await page.getByRole("button", { name: /File liquidation for/ }).click();
    await page.waitForURL(/\/liquidations\//);
    formUrl = page.url();
    await page.waitForLoadState("networkidle");
    const shared = page.locator("#liquidation-plate");
    const plates = page.locator('input[id^="plate-"]');

    await page.getByRole("button", { name: "Add particular" }).click();
    await expect(plates).toHaveCount(2);
    await shared.fill("ABC 123");
    await expect(plates.nth(0)).toHaveValue("ABC 123");
    await expect(plates.nth(1)).toHaveValue("ABC 123");
    await expect(page.getByText("Filled in on all 2 particulars")).toBeVisible();

    // a third particular starts with the shared plate; the second gets a plate of its own
    await page.getByRole("button", { name: "Add particular" }).click();
    await expect(plates.nth(2)).toHaveValue("ABC 123");
    await plates.nth(1).fill("XYZ 789");
    await expect(page.getByText(/Filled in on 2 of 3 particulars. One has its own plate/)).toBeVisible();

    // changing the shared plate leaves the particular with its own alone
    await shared.fill("DEF 456");
    await expect(plates.nth(0)).toHaveValue("DEF 456");
    await expect(plates.nth(1)).toHaveValue("XYZ 789");
    await expect(plates.nth(2)).toHaveValue("DEF 456");

    // and it can follow the plate above again
    await page.getByRole("button", { name: "Use the plate above (DEF 456)" }).click();
    await expect(plates.nth(1)).toHaveValue("DEF 456");
    await expect(page.getByText("Filled in on all 3 particulars")).toBeVisible();

    // N/A once, at the top, for every particular that follows
    await page.getByRole("button", { name: "N/A" }).first().click();
    for (const index of [0, 1, 2]) await expect(plates.nth(index)).toHaveValue("N/A");
    await context.close();
  });

  test("the plate and N/A are saved with the draft, and the odd plate comes back as its own", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(formUrl, { waitUntil: "networkidle" });
    // the earlier test saved nothing: build three complete particulars
    await page.getByRole("button", { name: "Add particular" }).click();
    await page.getByRole("button", { name: "Add particular" }).click();
    const plates = page.locator('input[id^="plate-"]');
    await expect(plates).toHaveCount(3);
    const count = 3;
    for (let i = 0; i < count; i++) {
      await page.locator('textarea[id^="particulars-"]').nth(i).fill(`Line ${i + 1}`);
      await page.locator('input[id^="amount-"]').nth(i).fill("100");
    }
    await page.locator("#liquidation-plate").fill("ABC 123");
    await plates.nth(count - 1).fill("XYZ 789");
    await expect(page.getByText(/Saved automatically at/)).toBeVisible({ timeout: 15000 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#liquidation-plate")).toHaveValue("ABC 123");
    await expect(plates.nth(count - 1)).toHaveValue("XYZ 789");
    await expect(page.getByText(/have their own plates|One has its own plate/)).toBeVisible();
    await context.close();
  });

  test("the reviewer gets the same: one plate for all entries, and N/A for every empty field", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(formUrl, { waitUntil: "networkidle" });
    await page.locator("#liquidation-department").fill("Operations");
    await page.getByRole("button", { name: "Submit for review", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Submitted to the custodian")).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });

    const review = page.locator("#review-plate");
    await expect(review).toBeVisible();
    // every empty field becomes N/A in one tap, and what is typed is kept
    await page.locator('input[id^="supplier-"]').first().fill("Shop");
    await page.getByRole("button", { name: "Mark every empty field N/A" }).click();
    await expect(page.getByText(/N\/A filled in \d+ empty fields?/)).toBeVisible();
    await expect(page.locator('input[id^="supplier-"]').first()).toHaveValue("Shop");
    for (const prefix of ["tin-", "receipt_number-"]) await expect(page.locator(`input[id^="${prefix}"]`).first()).toHaveValue("N/A");
    // a second tap has nothing left to fill
    await page.getByRole("button", { name: "Mark every empty field N/A" }).click();
    await expect(page.getByText("There is no empty field left to mark N/A.")).toBeVisible();

    // one plate for all entries
    await review.fill("QRS 456");
    await expect(page.locator('input[id^="plate-"]').first()).toHaveValue("QRS 456");
    await context.close();
  });
});
