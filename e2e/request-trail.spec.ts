import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

const FUND = "Trail Test";

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
  let requestId: string;

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
    requestId = request.data as string;
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

  test("desktop: the trail is at the top of each page and every step that exists opens", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(`/requests/${requestId}`, { waitUntil: "networkidle" });
    const trail = page.getByRole("navigation", { name: "Request trail" });
    await expect(trail).toBeVisible();
    // the trail comes before the page title
    const trailBox = await trail.boundingBox();
    const titleBox = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(trailBox!.y).toBeLessThan(titleBox!.y);
    await expect(trail.getByRole("link", { name: /Budget request/ })).toHaveAttribute("aria-current", "page");
    await expect(trail.getByText("Settlement", { exact: true }).filter({ visible: true })).toBeVisible();
    // not yet reachable: no link
    await expect(trail.getByRole("link", { name: /Settlement/ })).toHaveCount(0);

    await trail.getByRole("link", { name: /Voucher/ }).click();
    await page.waitForURL(/\/vouchers\//);
    const voucherTrail = page.getByRole("navigation", { name: "Request trail" });
    await expect(voucherTrail.getByRole("link", { name: /Voucher/ })).toHaveAttribute("aria-current", "page");
    await expect(voucherTrail.getByText(/cash released/).filter({ visible: true })).toBeVisible();
    await voucherTrail.getByRole("link", { name: /Budget request/ }).click();
    await page.waitForURL(new RegExp(`/requests/${requestId}`));

    // the liquidation appears in the trail once it is filed
    await page.goto(`/vouchers/${voucherId}`);
    await page.getByRole("button", { name: /File liquidation for/ }).click();
    await page.waitForURL(/\/liquidations\//);
    const liquidationTrail = page.getByRole("navigation", { name: "Request trail" });
    await expect(liquidationTrail.getByRole("link", { name: /Liquidation/ })).toHaveAttribute("aria-current", "page");
    await expect(liquidationTrail.getByText("Draft, not submitted").filter({ visible: true })).toBeVisible();
    await liquidationTrail.getByRole("link", { name: /Budget request/ }).click();
    await page.waitForURL(new RegExp(`/requests/${requestId}`));
    await expect(page.getByRole("navigation", { name: "Request trail" }).getByRole("link", { name: /Liquidation/ })).toBeVisible();
    await context.close();
  });

  test("phone: one line at the top that opens into the list, and a tap goes there", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(`/requests/${requestId}`, { waitUntil: "networkidle" });
    const summary = page.getByText(/Trail · step 1 of 4/);
    await expect(summary).toBeVisible();
    // the list is closed until it is opened
    await expect(page.getByRole("navigation", { name: "Request trail" }).getByRole("link", { name: /Voucher/ })).toBeHidden();
    await summary.click();
    const voucherLink = page.getByRole("navigation", { name: "Request trail" }).getByRole("link", { name: /Voucher/ });
    await expect(voucherLink).toBeVisible();
    expect((await voucherLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await voucherLink.click();
    await page.waitForURL(/\/vouchers\//);
    await expect(page.getByText(/Trail · step 2 of 4/)).toBeVisible();
    // no sideways scrolling
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await context.close();
  });

  test("the lists say where each item stands in the whole trail", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    // the first test filed a liquidation, still a draft
    await page.goto("/requests", { waitUntil: "networkidle" });
    await expect(page.getByText("Liquidation: Draft, not submitted").filter({ visible: true }).first()).toBeVisible();
    await page.goto("/vouchers", { waitUntil: "networkidle" });
    await expect(page.getByText("Liquidation: Draft, not submitted").filter({ visible: true }).first()).toBeVisible();
    await page.goto("/liquidations", { waitUntil: "networkidle" });
    await expect(page.getByText("Liquidation: Draft, not submitted").filter({ visible: true }).first()).toBeVisible();
    await context.close();
  });
});
