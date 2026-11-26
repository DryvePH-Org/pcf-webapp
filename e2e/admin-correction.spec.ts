import { expect, test, type Browser } from "@playwright/test";

import { DEV_PASSWORD, adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor, type Role } from "./helpers";

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

test.describe("an administrator sends a liquidation back (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let fundId: string;
  let liquidationId: string;
  let voucherId: string;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    const admin = await clientFor("admin");
    const custodian = await clientFor("custodian");
    const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
    fundId = fund!.id;
    const request = await custodian.rpc("create_budget_request", { p_fund_id: fundId, p_name: "Custodian", p_amount: 900, p_purpose: `Correction ${Date.now()}` });
    expect(request.error).toBeNull();
    expect((await admin.rpc("review_budget_request", { p_id: request.data, p_approve: true, p_note: null })).error).toBeNull();
    const voucher = await admin.rpc("save_workflow_voucher", {
      p_id: null, p_fund: fundId, p_request: request.data, p_payee: "Custodian", p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: "Supplies", amount: 900 }], p_number_mode: "none", p_number: null,
    });
    expect(voucher.error).toBeNull();
    voucherId = voucher.data as string;
    expect((await admin.rpc("release_voucher", { p_id: voucherId })).error).toBeNull();
    const liquidation = await custodian.rpc("create_liquidation", { p_voucher_id: voucherId });
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
    await adminClient().from("admin_corrections").delete().eq("target_id", liquidationId);
    await cleanTestData();
  });

  test("only an administrator sees the correction", async ({ browser, baseURL }) => {
    const custodian = await pageAs(browser, "custodian", baseURL!);
    await custodian.goto(`/liquidations/${liquidationId}`);
    await expect(custodian.getByText("Expense report")).toBeVisible();
    await expect(custodian.getByText("Administrator correction")).toHaveCount(0);
  });

  test("a wrong password is refused; the right one sends it back as a draft, and it is logged", async ({ browser, baseURL }) => {
    const admin = await pageAs(browser, "admin", baseURL!);
    await admin.goto(`/liquidations/${liquidationId}`);
    await admin.getByRole("button", { name: /Send back or delete/ }).click();
    const dialog = admin.getByRole("dialog");
    await expect(dialog.getByText(/spent/)).toBeVisible();
    await dialog.getByLabel("Reason").fill("Filed with the wrong amounts");
    await dialog.getByLabel("Your password").fill("not-the-password");
    await dialog.getByRole("button", { name: "Send back as draft" }).click();
    await expect(dialog.getByText("Your password is not correct.")).toBeVisible();
    expect((await adminClient().from("liquidations").select("status").eq("id", liquidationId).single()).data?.status).toBe("submitted");

    await dialog.getByLabel("Your password").fill(DEV_PASSWORD);
    await dialog.getByRole("button", { name: "Send back as draft" }).click();
    await expect.poll(async () => (await adminClient().from("liquidations").select("status").eq("id", liquidationId).single()).data?.status, { timeout: 20000 }).toBe("draft");
    const log = await adminClient().from("admin_corrections").select("action, reason").eq("target_id", liquidationId);
    expect(log.data).toEqual([{ action: "liquidation_reopened", reason: "Filed with the wrong amounts" }]);

    // the owner can now fix it and submit again
    const custodian = await clientFor("custodian");
    const filing = (await adminClient().from("liquidations").select("filing_date").eq("id", liquidationId).single()).data!.filing_date;
    expect((await custodian.rpc("save_liquidation", {
      p_id: liquidationId, p_department: "Ops", p_filing_date: filing,
      p_items: [{ id: crypto.randomUUID(), particulars: "Supplies", amount: 700, no_receipt_reason: "No receipt" }], p_unspent_reason: null,
    })).error).toBeNull();
    expect((await custodian.rpc("submit_liquidation", { p_id: liquidationId })).error).toBeNull();
  });
});
