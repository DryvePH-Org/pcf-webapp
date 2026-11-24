import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

const NUMBER = /^[A-Z][A-Z0-9]{0,3}-\d{4,}$/;
let fundId = "";
let code = "";

test.beforeAll(async () => {
  assertSafeTarget();
  await cleanTestData();
  const { data: fund } = await adminClient().from("funds").select("id, code").eq("name", "Main Petty Cash").single();
  fundId = fund!.id;
  code = fund!.code;
});
test.afterAll(async () => {
  await cleanTestData();
});

test("the form shows the voucher number the fund will give, and does not ask for one", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await cookiesFor("custodian", baseURL!));
  const page = await context.newPage();
  await page.goto("/vouchers/new", { waitUntil: "networkidle" });
  await expect(page.getByText("Voucher number", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: NUMBER })).toBeVisible();
  await expect(page.getByText(`${code}-`).first()).toBeVisible();
  await expect(page.getByText("Enter number manually")).toHaveCount(0);
  await expect(page.getByText("Automatic next number")).toHaveCount(0);
  await context.close();
});

test("a voucher gets the fund's letters, a typed number is ignored, and the next one follows", async () => {
  const custodian = await clientFor("custodian");
  const make = async (mode: string, typed: string | null) => {
    const saved = await custodian.rpc("save_workflow_voucher", {
      p_id: null, p_fund: fundId, p_request: null, p_payee: "Number test", p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: "Supplies", amount: 10 }], p_number_mode: mode, p_number: typed,
    });
    expect(saved.error).toBeNull();
    return (await adminClient().from("vouchers").select("pcv_number, paper_pcv_number").eq("id", saved.data).single()).data!;
  };
  const first = await make("none", null);
  expect(first.pcv_number).toMatch(NUMBER);
  expect(first.pcv_number.startsWith(`${code}-`)).toBe(true);
  expect(first.paper_pcv_number).toBe(first.pcv_number);
  const typed = await make("manual", "TYPED-1");
  expect(typed.paper_pcv_number).toBe(typed.pcv_number);
  const digits = (value: string) => Number(value.replace(/^.*-/, ""));
  expect(digits(typed.pcv_number)).toBe(digits(first.pcv_number) + 1);
});
