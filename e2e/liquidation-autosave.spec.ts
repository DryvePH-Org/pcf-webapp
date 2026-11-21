import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

const FUND = "Autosave Test";

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
  async function openForm(page: import("@playwright/test").Page) {
    await page.goto(`/vouchers/${voucherId}`);
    await page.getByRole("button", { name: /File liquidation for/ }).click();
    await page.waitForURL(/\/liquidations\//);
    return page.url();
  }

  test("what is typed and the receipt photo survive a reload, with no button pressed", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    const url = await openForm(page);
    formUrl = url;
    await page.locator("#liquidation-department").fill("Operations");
    await page.getByLabel("Amount actually spent (₱)").fill("850");
    await page.getByLabel("Particulars").fill("Printer paper for the office");
    // a photo: it is uploaded at once and only remembered by the page, until the draft is saved
    await page.locator('input[type="file"]').first().setInputFiles({ name: "receipt.jpg", mimeType: "image/jpeg", buffer: Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64") });
    await expect(page.getByText(/Saved automatically at/)).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.locator("#liquidation-department")).toHaveValue("Operations");
    await expect(page.getByLabel("Amount actually spent (₱)")).toHaveValue("850.00");
    await expect(page.getByLabel("Particulars")).toHaveValue("Printer paper for the office");
    await expect(page.getByText("Attached", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("No file yet")).toBeHidden();
    expect(page.url()).toBe(url);
    await context.close();
  });

  test("an unfinished line is kept on the device and comes back after a reload", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(formUrl, { waitUntil: "networkidle" });
    await expect(page.getByLabel("Particulars")).toHaveValue("Printer paper for the office");
    await page.getByLabel("Particulars").fill("Taxi to the supplier, amount not typed yet");
    await page.getByLabel("Amount actually spent (₱)").fill("");
    await expect(page.getByText(/kept on this device/)).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByLabel("Particulars")).toHaveValue("Taxi to the supplier, amount not typed yet");
    await expect(page.getByText(/brought back what you were typing/)).toBeVisible();
    await page.getByRole("button", { name: "Start over from the saved version" }).click();
    await expect(page.getByText(/brought back what you were typing/)).toBeHidden();
    await context.close();
  });

  test("typing during an automatic save is never wiped by it", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(formUrl, { waitUntil: "networkidle" });
    const particulars = page.getByLabel("Particulars");
    await expect(particulars).toHaveValue("Printer paper for the office");
    await page.getByLabel("Amount actually spent (₱)").fill("120");
    let typed = "";
    for (const word of ["one ", "two ", "three ", "four ", "five ", "six "]) {
      typed += word;
      await particulars.fill(typed);
      await page.waitForTimeout(700);
    }
    await expect(particulars).toHaveValue(typed);
    await expect(page.getByText(/Saved automatically at/)).toBeVisible({ timeout: 15000 });
    await expect(particulars).toHaveValue(typed);
    await context.close();
  });

  test("more than one picture on a line: chosen together, kept after a reload, shown after submitting", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(formUrl, { waitUntil: "networkidle" });
    await expect(page.getByLabel("Particulars")).toHaveValue("one two three four five six");
    const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
    // the first picture is already there; two more are chosen at once
    await expect(page.getByText("0 of 5 added")).toBeVisible();
    await page.locator('input[id^="more-"]').setInputFiles([
      { name: "back.jpg", mimeType: "image/jpeg", buffer: jpeg },
      { name: "side.jpg", mimeType: "image/jpeg", buffer: jpeg },
    ]);
    await expect(page.getByText("2 of 5 added")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Picture 2", { exact: true })).toBeVisible();
    await expect(page.getByText("Picture 3", { exact: true })).toBeVisible();
    await expect(page.getByText(/Saved automatically at/)).toBeVisible({ timeout: 15000 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("2 of 5 added")).toBeVisible();

    // removing one keeps the other; removing the main picture promotes the next one
    await page.getByRole("button", { name: "Remove picture 2" }).click();
    await expect(page.getByText("1 of 5 added")).toBeVisible();
    await page.locator("div.border-2", { hasText: "Receipt attachment" }).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("0 of 5 added")).toBeVisible();
    await expect(page.getByText("Attached", { exact: true }).filter({ visible: true }).first()).toBeVisible();

    // add two again, submit, and the reviewer sees every picture
    await page.locator('input[id^="more-"]').setInputFiles([
      { name: "a.jpg", mimeType: "image/jpeg", buffer: jpeg },
      { name: "b.jpg", mimeType: "image/jpeg", buffer: jpeg },
    ]);
    await expect(page.getByText("2 of 5 added")).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "Submit for review", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Submitted to the custodian")).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: "Picture 2" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Picture 3" })).toBeVisible();
    const liquidationId = formUrl.split("/liquidations/")[1].split(/[?#]/)[0];
    const stored = await adminClient().from("liquidation_item_photos").select("path").eq("liquidation_id", liquidationId);
    expect(stored.data).toHaveLength(2);
    await context.close();
  });
});
