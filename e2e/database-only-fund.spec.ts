import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

const FUND = "Database Only Test";

// Remove the test fund and what hangs off it, and say so if that fails (a leftover would break the next run).
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

// A fund whose ledger lives in the app only: created in the admin screen, then a liquidation is reviewed
// and approved with no Google Sheet and no Grokbot anywhere.
test.describe("a database-only fund (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  let fundId: string;
  let liquidationId: string;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    await removeTestFund();
  });

  test.afterAll(async () => {
    await cleanTestData();
    await removeTestFund();
  });

  test("the admin creates it with its tag list", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("admin", baseURL!));
    const page = await context.newPage();
    await page.goto("/admin/funds");
    await page.getByRole("button", { name: "New fund" }).click();
    await page.getByLabel("Fund name").fill(FUND);
    await page.getByLabel("Fund amount").fill("5000");
    await page.getByLabel("Per-transaction limit").fill("1000");
    // The tag box only appears once the fund is database-only.
    await expect(page.getByLabel("Expense tags (one per line)")).toHaveCount(0);
    await page.getByLabel("Keep this fund's ledger in the database only").check();
    await page.getByLabel("Expense tags (one per line)").fill("MEALS\nFUEL\n  MEALS  \n\nPARKING");
    await page.getByRole("button", { name: "Create fund" }).click();
    await expect(page.getByText("Fund created")).toBeVisible();
    await expect(page.getByText("Database only").first()).toBeVisible();

    const fund = await adminClient().from("funds").select("id, sheet_ledger").eq("name", FUND).single();
    expect(fund.data?.sheet_ledger).toBe(false);
    fundId = fund.data!.id;
    const tags = await adminClient().from("fund_expense_tags").select("tag, position").eq("fund_id", fundId).order("position");
    expect(tags.data?.map((row) => row.tag)).toEqual(["MEALS", "FUEL", "PARKING"]);
    await context.close();
  });

  test("a liquidation is reviewed and approved with no sheet", async ({ browser, baseURL }) => {
    const admin = await clientFor("admin");
    const custodian = await clientFor("custodian");
    const custodianId = (await custodian.auth.getUser()).data.user!.id;
    expect((await admin.rpc("set_fund_custodians", { p_fund_id: fundId, p_custodian_ids: [custodianId] })).error).toBeNull();
    // the custodian asks, the administrator reviews, prepares and releases (a custodian cannot do that to her own)
    const request = await custodian.rpc("create_budget_request", { p_fund_id: fundId, p_name: "Custodian", p_amount: 900, p_purpose: `Database only ${Date.now()}` });
    expect(request.error).toBeNull();
    expect((await admin.rpc("review_budget_request", { p_id: request.data, p_approve: true, p_note: null })).error).toBeNull();
    const voucher = await admin.rpc("save_workflow_voucher", {
      p_id: null, p_fund: fundId, p_request: request.data, p_payee: "Custodian", p_date: new Date().toISOString().slice(0, 10),
      p_items: [{ particulars: "Supplies", amount: 900 }], p_number_mode: "none", p_number: null,
    });
    expect(voucher.error).toBeNull();
    expect((await admin.rpc("release_voucher", { p_id: voucher.data })).error).toBeNull();
    const liquidation = await custodian.rpc("create_liquidation", { p_voucher_id: voucher.data });
    expect(liquidation.error).toBeNull();
    liquidationId = liquidation.data as string;
    const filing = (await adminClient().from("liquidations").select("filing_date").eq("id", liquidationId).single()).data!.filing_date;
    expect((await custodian.rpc("save_liquidation", {
      p_id: liquidationId, p_department: "Ops", p_filing_date: filing,
      p_items: [{ id: crypto.randomUUID(), particulars: "Supplies", amount: 900, no_receipt_reason: "No receipt" }], p_unspent_reason: null,
    })).error).toBeNull();
    expect((await custodian.rpc("submit_liquidation", { p_id: liquidationId })).error).toBeNull();

    // the reviewer sees the fund's own tags and, once the review is saved, a plain Approve button
    const tags = await admin.rpc("list_custodian_tags", { p_fund: fundId });
    expect(tags.data).toEqual(["MEALS", "FUEL", "PARKING"]);
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("admin", baseURL!));
    const page = await context.newPage();
    await page.goto(`/liquidations/${liquidationId}`);
    await expect(page.getByRole("button", { name: "Approve liquidation" })).toHaveCount(0);

    const revision = (await adminClient().from("liquidations").select("receipt_review_revision").eq("id", liquidationId).single()).data!.receipt_review_revision;
    expect((await admin.rpc("save_custodian_receipts", {
      p_id: liquidationId, p_revision: revision,
      p_lines: [{ particulars: "Supplies", amount: 900, supplier: "N/A", tin: "N/A", tag: "MEALS", expense_date: filing, plate: "N/A", receipt_number: "", physical_checked: true, receipt_path: "" }],
    })).error).toBeNull();
    await page.reload();
    await expect(page.getByRole("button", { name: "Review and approve liquidation" })).toHaveCount(0);
    await page.getByRole("button", { name: "Approve liquidation" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Liquidation approved")).toBeVisible();

    const approved = await adminClient().from("liquidations").select("status").eq("id", liquidationId).single();
    expect(approved.data?.status).toBe("approved");
    // nothing was queued for a sheet
    expect((await adminClient().from("sheet_jobs").select("id").eq("liquidation_id", liquidationId)).data).toHaveLength(0);
    expect((await adminClient().from("grokbot_operations").select("id").eq("liquidation_id", liquidationId)).data).toHaveLength(0);
    await context.close();
  });
});
