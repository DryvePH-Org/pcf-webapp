import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  adminClient,
  cleanTestData,
  clientFor,
  cookiesFor,
  type Role,
} from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against the development project.",
);
test.describe.configure({ mode: "serial" });

async function pageAs(browser: Browser, role: Role, baseURL: string) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.addCookies(await cookiesFor(role, baseURL));
  return context.newPage();
}

async function balance() {
  const { data, error } = await adminClient()
    .from("fund_balance_v")
    .select("*")
    .single();
  if (error) throw error;
  return {
    fund: Number(data.fund_amount),
    expected: Number(data.expected_cash),
    released: Number(data.released_vouchers_total),
  };
}

async function toastText(page: Page, text: string) {
  await expect(page.getByText(text).first()).toBeVisible();
}

test.describe("voucher to replenishment happy path (desktop)", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    "The two-pane approval flow is the desktop layout.",
  );

  test.beforeAll(cleanTestData);
  test.afterAll(cleanTestData);

  test("custodian releases, approver reviews, accounting restores the fund", async ({
    browser,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3000";
    const admin = adminClient();
    const custodian = await clientFor("custodian");

    const { data: fund } = await admin
      .from("funds")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();
    const { data: category } = await admin
      .from("categories")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();
    expect(fund && category).toBeTruthy();

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
    }).format(new Date());

    async function releasedVoucher(amount: number, payee: string) {
      const { data: id, error } = await custodian.rpc("create_voucher", {
        p_fund_id: fund!.id,
        p_payee: payee,
        p_particulars: `E2E ${payee}`,
        p_amount: amount,
        p_category_id: category!.id,
        p_voucher_date: today,
        p_no_receipt_reason: "E2E no receipt",
      });
      if (error) throw error;
      const { error: releaseError } = await custodian.rpc("release_voucher", {
        p_id: id,
      });
      if (releaseError) throw releaseError;
      return id as string;
    }

    const approvedId = await releasedVoucher(250, "E2E Approved Payee");
    const flaggedId = await releasedVoucher(300, "E2E Flagged Payee");

    // Releasing lowers expected cash by exactly the voucher amounts.
    const afterRelease = await balance();
    expect(afterRelease.released).toBe(550);
    expect(afterRelease.expected).toBe(afterRelease.fund - 550);

    // Approver approves one voucher and flags the other; cash stays counted.
    const approver = await pageAs(browser, "approver", base);
    await approver.goto("/approvals");
    await approver
      .getByRole("button")
      .filter({ hasText: "E2E Approved Payee" })
      .click();
    await approver.getByRole("button", { name: "Approve", exact: true }).click();
    await approver
      .getByRole("dialog")
      .getByRole("button", { name: "Approve" })
      .click();
    await toastText(approver, "Voucher approved.");

    await approver
      .getByRole("button")
      .filter({ hasText: "E2E Flagged Payee" })
      .click();
    await approver.getByRole("button", { name: "Flag", exact: true }).click();
    await approver.getByLabel("What is wrong?").fill("E2E: receipt mismatch");
    await approver
      .getByRole("dialog")
      .getByRole("button", { name: "Flag voucher" })
      .click();
    await toastText(approver, "Voucher flagged.");

    const { data: statuses } = await admin
      .from("vouchers")
      .select("id, status")
      .in("id", [approvedId, flaggedId]);
    const byId = Object.fromEntries(
      (statuses ?? []).map((row) => [row.id, row.status]),
    );
    expect(byId[approvedId]).toBe("approved");
    expect(byId[flaggedId]).toBe("rejected");
    expect((await balance()).expected).toBe(afterRelease.expected);

    // Custodian counts the cash: variance is zero.
    const custodianPage = await pageAs(browser, "custodian", base);
    await custodianPage.goto("/cash-count");
    await custodianPage
      .locator("#cash-count-counted")
      .fill(afterRelease.expected.toFixed(2));
    await custodianPage
      .getByRole("button", { name: "Record cash count" })
      .click();
    await toastText(custodianPage, "Cash count recorded");
    const { data: count } = await admin
      .from("cash_counts")
      .select("variance")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(Number(count?.variance)).toBe(0);

    // Custodian bundles and submits a replenishment.
    await custodianPage.goto("/replenishments");
    await custodianPage
      .getByRole("button", { name: "New replenishment" })
      .click();
    await custodianPage
      .getByRole("dialog")
      .getByRole("button", { name: "Create draft" })
      .click();
    await custodianPage.waitForURL(/\/replenishments\/[0-9a-f-]{36}$/);
    const detailPath = new URL(custodianPage.url()).pathname;
    await custodianPage
      .getByRole("button", { name: "Submit to accounting" })
      .click();
    await custodianPage
      .getByRole("dialog")
      .getByRole("button", { name: "Submit" })
      .click();
    await toastText(custodianPage, "Replenishment submitted.");

    // Accounting approves and closes it; the fund is whole again.
    const accounting = await pageAs(browser, "accounting", base);
    await accounting.goto(detailPath);
    await accounting.getByRole("button", { name: "Approve" }).click();
    await accounting
      .getByRole("dialog")
      .getByRole("button", { name: "Approve" })
      .click();
    await toastText(accounting, "Replenishment approved.");
    await accounting
      .getByRole("button", { name: "Mark as replenished and close" })
      .click();
    await accounting
      .getByRole("dialog")
      .getByRole("button", { name: "Close replenishment" })
      .click();
    await expect(accounting.getByText("Closed and fund restored")).toBeVisible();

    const restored = await balance();
    expect(restored.expected).toBe(restored.fund);
    expect(restored.released).toBe(0);

    // Admin sees the whole story in the audit trail.
    const adminPage = await pageAs(browser, "admin", base);
    await adminPage.goto("/audit");
    await expect(adminPage.getByText("Replenishment").first()).toBeVisible();
    await expect(adminPage.getByText("Status changed").first()).toBeVisible();
  });
});
