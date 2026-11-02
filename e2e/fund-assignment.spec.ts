import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against the development project.",
);
test.describe.configure({ mode: "serial" });

const fundName = `E2E Fund ${Date.now()}`;
let extraFundId: string;
let mainFundId: string;
let custodianId: string;

test.describe("admin assigns funds to a custodian (desktop)", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    "Uses the desktop table layout.",
  );

  test.beforeAll(async () => {
    assertSafeTarget();
    const admin = adminClient();
    const { data: main } = await admin
      .from("funds")
      .select("id, custodian_id")
      .eq("name", "Main Petty Cash")
      .single();
    mainFundId = main!.id;
    custodianId = main!.custodian_id!;

    const { data: extra, error } = await admin
      .from("funds")
      .insert({ name: fundName, amount: 3000, per_txn_limit: 300 })
      .select("id")
      .single();
    if (error) throw error;
    extraFundId = extra.id;
  });

  test.afterAll(async () => {
    const asAdmin = await clientFor("admin");
    await asAdmin.rpc("assign_custodian_funds", {
      p_user_id: custodianId,
      p_fund_ids: [mainFundId],
    });
    await adminClient().from("funds").delete().eq("id", extraFundId);
  });

  test("assign a second fund, then the custodian can use it", async ({ browser, baseURL }) => {
    const base = baseURL ?? "http://localhost:3000";
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(await cookiesFor("admin", base));
    const page = await context.newPage();

    await page.goto("/admin/users");
    const row = page.getByRole("row", { name: /PCF Custodian/ });
    await expect(row.getByText("Main Petty Cash")).toBeVisible();
    await row.getByRole("button", { name: "Change" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Funds for PCF Custodian")).toBeVisible();
    await dialog.getByRole("checkbox", { name: new RegExp(fundName) }).check();
    await dialog.getByRole("button", { name: "Save funds" }).click();
    await expect(page.getByText("Funds updated").first()).toBeVisible();

    const { data: funds } = await adminClient()
      .from("funds")
      .select("id, custodian_id")
      .in("id", [mainFundId, extraFundId]);
    expect(funds?.every((fund) => fund.custodian_id === custodianId)).toBe(true);

    // The custodian now sees both funds on their dashboard.
    const custodianContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await custodianContext.addCookies(await cookiesFor("custodian", base));
    const custodianPage = await custodianContext.newPage();
    await custodianPage.goto("/dashboard");
    await expect(custodianPage.getByText(fundName).first()).toBeVisible();
    await expect(custodianPage.getByText("Main Petty Cash").first()).toBeVisible();
  });

  test("a custodian who still holds funds cannot be deactivated", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(await cookiesFor("admin", baseURL ?? "http://localhost:3000"));
    const page = await context.newPage();

    await page.goto("/admin/users");
    const row = page.getByRole("row", { name: /PCF Custodian/ });
    await row.getByRole("button", { name: "Deactivate" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText(/still holds/).first()).toBeVisible();
  });

  test("unassigning removes the fund from the custodian's view", async ({ browser, baseURL }) => {
    const base = baseURL ?? "http://localhost:3000";
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(await cookiesFor("admin", base));
    const page = await context.newPage();

    await page.goto("/admin/users");
    const row = page.getByRole("row", { name: /PCF Custodian/ });
    await row.getByRole("button", { name: "Change" }).click();
    await page
      .getByRole("dialog")
      .getByRole("checkbox", { name: new RegExp(fundName) })
      .uncheck();
    await page.getByRole("dialog").getByRole("button", { name: "Save funds" }).click();
    await expect(page.getByText("Funds updated").first()).toBeVisible();

    const custodianContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await custodianContext.addCookies(await cookiesFor("custodian", base));
    const custodianPage = await custodianContext.newPage();
    await custodianPage.goto("/dashboard");
    await expect(custodianPage.getByText("Main Petty Cash").first()).toBeVisible();
    await expect(custodianPage.getByText(fundName)).toHaveCount(0);
  });
});
