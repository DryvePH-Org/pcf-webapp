import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

let pcv = "";

test.beforeAll(async () => {
  assertSafeTarget();
  await cleanTestData();
  const { data: fund } = await adminClient().from("funds").select("id").eq("name", "Main Petty Cash").single();
  const custodian = await clientFor("custodian");
  const employee = await clientFor("accounting");
  const request = await employee.rpc("create_budget_request", { p_fund_id: fund!.id, p_name: "Employee", p_amount: 123, p_purpose: `Export ${Date.now()}` });
  expect(request.error).toBeNull();
  await custodian.rpc("review_budget_request", { p_id: request.data, p_approve: true, p_note: null });
  const voucher = await custodian.rpc("save_workflow_voucher", {
    p_id: null, p_fund: fund!.id, p_request: request.data, p_payee: "Export, Payee", p_date: new Date().toISOString().slice(0, 10),
    p_items: [{ particulars: "=Looks like a formula", amount: 123 }], p_number_mode: "none", p_number: null,
  });
  expect(voucher.error).toBeNull();
  pcv = (await adminClient().from("vouchers").select("pcv_number").eq("id", voucher.data).single()).data!.pcv_number as string;
});
test.afterAll(async () => {
  await cleanTestData();
});

test("the vouchers CSV is made when asked for, follows the filters, and is safe to open", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await cookiesFor("custodian", baseURL!));
  const page = await context.newPage();
  await page.goto("/vouchers", { waitUntil: "networkidle" });
  // the button is a plain download link carrying the current filters
  const link = page.locator('a[href^="/api/vouchers/export"]').first();
  await expect(link).toHaveAttribute("href", "/api/vouchers/export?");
  await page.goto("/vouchers?status=draft", { waitUntil: "networkidle" });
  await expect(page.locator('a[href^="/api/vouchers/export"]').first()).toHaveAttribute("href", "/api/vouchers/export?status=draft");

  const all = await context.request.get("/api/vouchers/export");
  expect(all.status()).toBe(200);
  expect(all.headers()["content-type"]).toContain("text/csv");
  expect(all.headers()["content-disposition"]).toContain("vouchers.csv");
  const text = await all.text();
  expect(text).toContain("PCV Number,Date,Payee,Particulars,Category,Fund,Amount,Status");
  expect(text).toContain(pcv);
  expect(text).toContain("'=Looks like a formula"); // a cell that starts with = cannot run as a formula

  const filtered = await context.request.get(`/api/vouchers/export?q=${encodeURIComponent(pcv)}`);
  expect((await filtered.text()).split("\r\n").length).toBe(2);
  const none = await context.request.get("/api/vouchers/export?q=no-such-voucher-anywhere");
  expect((await none.text()).split("\r\n").length).toBe(1);
  await context.close();

  const anonymous = await browser.newContext();
  const refused = await anonymous.request.get(`${baseURL}/api/vouchers/export`);
  expect(refused.status()).toBe(403);
  await anonymous.close();
});
