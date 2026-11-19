import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

// A requester files a liquidation without a department: the draft saves, Submit points at the field, and
// it goes through once the department is entered.
test.describe("a liquidation draft without a department (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let fundId: string;
  let liquidationId: string;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    const admin = await clientFor("admin");
    const custodian = await clientFor("custodian");
    const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
    fundId = fund!.id;
    await admin.rpc("set_fund_approvers", { p_fund_id: fundId, p_approver_ids: [] });
    expect((await admin.rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: true })).error).toBeNull();
    const request = await custodian.rpc("create_budget_request", { p_fund_id: fundId, p_name: "Custodian", p_amount: 900, p_purpose: `Draft department ${Date.now()}` });
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
  });

  test.afterAll(async () => {
    const admin = await clientFor("admin");
    await admin.rpc("set_fund_self_approval", { p_fund_id: fundId, p_allowed: false });
    await cleanTestData();
  });

  test("saves the draft, points at the department on Submit, then submits", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(`/liquidations/${liquidationId}`);
    const department = page.locator("#liquidation-department");
    await expect(department).toBeVisible();
    await expect(department).toHaveValue("");
    // the browser itself must not block an empty department
    expect(await department.getAttribute("required")).toBeNull();

    // The requester types what was actually spent (the form starts blank on purpose).
    await page.getByLabel("Amount actually spent (₱)").fill("900");

    // Save draft with nothing in Department: it saves.
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Liquidation draft saved")).toBeVisible();
    const saved = await adminClient().from("liquidations").select("status, department, total_spent").eq("id", liquidationId).single();
    expect(saved.data).toMatchObject({ status: "draft", department: "", total_spent: 900 });
    // After a save the page refreshes and rebuilds the form; let that finish, as a person would.
    await page.waitForLoadState("networkidle");
    // The saved draft comes back as it was saved: the amount is still there, not blank.
    await expect(page.getByLabel("Amount actually spent (₱)")).toHaveValue("900.00");

    // Submit with nothing in Department: it says so beside the field and moves the cursor there.
    await page.getByRole("button", { name: "Submit for review", exact: true }).click();
    await expect(page.getByText("Department is required.").first()).toBeVisible();
    await expect(department).toBeFocused();
    expect((await adminClient().from("liquidations").select("status").eq("id", liquidationId).single()).data?.status).toBe("draft");

    // With a department it goes through.
    await department.fill("Operations");
    await page.getByRole("button", { name: "Submit for review", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Submitted to the custodian")).toBeVisible();
    const submitted = await adminClient().from("liquidations").select("status, department").eq("id", liquidationId).single();
    expect(submitted.data).toMatchObject({ status: "submitted", department: "Operations" });
    await context.close();
  });
});
