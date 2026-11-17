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

test.describe("a large budget request goes to the approver after the custodian (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let fundId: string;
  let requestId: string;
  let before: { per_txn_limit: number; approval_threshold: number };

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    const admin = await clientFor("admin");
    const { data: fund } = await adminClient().from("funds").select("id, per_txn_limit, approval_threshold").eq("name", "Main Petty Cash").single();
    fundId = fund!.id;
    before = { per_txn_limit: Number(fund!.per_txn_limit), approval_threshold: Number(fund!.approval_threshold) };
    await adminClient().from("funds").update({ per_txn_limit: 20000, approval_threshold: 3000 }).eq("id", fundId);
    const approverId = (await (await clientFor("approver")).auth.getUser()).data.user!.id;
    expect((await admin.rpc("set_fund_approvers", { p_fund_id: fundId, p_approver_ids: [approverId] })).error).toBeNull();
    const request = await (await clientFor("accounting")).rpc("create_budget_request", { p_fund_id: fundId, p_name: "Accounting", p_amount: 5000, p_purpose: `E2E large ${Date.now()}` });
    expect(request.error).toBeNull();
    requestId = request.data as string;
  });

  test.afterAll(async () => {
    await adminClient().from("funds").update(before).eq("id", fundId);
    await (await clientFor("admin")).rpc("set_fund_approvers", { p_fund_id: fundId, p_approver_ids: [] });
  });

  test("the custodian's approval waits for the approver, who then clears it", async ({ browser, baseURL }) => {
    const custodian = await pageAs(browser, "custodian", baseURL!);
    await custodian.goto(`/requests/${requestId}`);
    await custodian.getByRole("button", { name: "Approve request" }).click();
    await custodian.getByRole("dialog").getByRole("button", { name: /^Approve/ }).click();
    await expect(custodian.getByText("Waiting for the approver")).toBeVisible();
    await expect(custodian.getByText("Awaiting approver").first()).toBeVisible();
    // No voucher yet, and the custodian cannot approve it a second time.
    await expect(custodian.getByRole("button", { name: "Create linked voucher" })).toHaveCount(0);
    await expect(custodian.getByRole("button", { name: "Approve request" })).toHaveCount(0);

    const approver = await pageAs(browser, "approver", baseURL!);
    await approver.goto("/dashboard");
    await expect(approver.getByText(/1 large budget request.* to approve/)).toBeVisible();
    await approver.goto(`/requests/${requestId}`);
    await expect(approver.getByText("This request needs your approval")).toBeVisible();
    await approver.getByRole("button", { name: "Approve request" }).click();
    await approver.getByRole("dialog").getByRole("button", { name: /^Approve/ }).click();
    await expect(approver.getByText("Approved — ready for voucher").first()).toBeVisible();

    // The voucher needs no second approval: the custodian prepares and releases it.
    const custodianRpc = await clientFor("custodian");
    const voucher = await custodianRpc.rpc("save_workflow_voucher", {
      p_id: null, p_fund: fundId, p_request: requestId, p_payee: "Accounting", p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: "Large purchase", amount: 5000 }], p_number_mode: "none", p_number: null,
    });
    expect(voucher.error).toBeNull();
    expect((await custodianRpc.rpc("release_voucher", { p_id: voucher.data })).error).toBeNull();
  });
});
