import { expect, test, type Browser } from "@playwright/test";

import {
  adminClient,
  assertSafeTarget,
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await cookiesFor(role, baseURL));
  return context.newPage();
}

test.describe("large voucher needs approval before cash goes out (desktop)", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    "The two-pane approval flow is the desktop layout.",
  );

  let fundId: string;
  let originalThreshold: number;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    const admin = adminClient();
    const { data: fund } = await admin
      .from("funds")
      .select("id, approval_threshold")
      .eq("name", "Main Petty Cash")
      .single();
    fundId = fund!.id;
    originalThreshold = Number(fund!.approval_threshold);
    await admin.from("funds").update({ approval_threshold: 500 }).eq("id", fundId);
  });

  test.afterAll(async () => {
    await adminClient()
      .from("funds")
      .update({ approval_threshold: originalThreshold })
      .eq("id", fundId);
    await cleanTestData();
  });

  test("submit, approve, then release", async ({ browser, baseURL }) => {
    const base = baseURL ?? "http://localhost:3000";
    const admin = adminClient();
    const custodianClient = await clientFor("custodian");
    const { data: category } = await admin
      .from("categories")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();

    const { data: id, error } = await custodianClient.rpc("create_voucher", {
      p_fund_id: fundId,
      p_payee: "E2E Big Payee",
      p_particulars: "E2E large purchase",
      p_amount: 600,
      p_category_id: category!.id,
      p_no_receipt_reason: "E2E no receipt",
    });
    if (error) throw error;
    const voucherId = id as string;

    const state = async () => {
      const { data } = await admin
        .from("vouchers")
        .select("status, released_at")
        .eq("id", voucherId)
        .single();
      return data!;
    };

    // Custodian can't release it directly, only submit it.
    const custodian = await pageAs(browser, "custodian", base);
    await custodian.goto(`/vouchers/${voucherId}`);
    await expect(custodian.getByRole("button", { name: "Release cash" })).toHaveCount(0);
    await custodian.getByRole("button", { name: "Submit for approval" }).click();
    await custodian.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
    await expect.poll(async () => (await state()).status).toBe("submitted");

    // Approver approves before any cash moves.
    const approver = await pageAs(browser, "approver", base);
    await approver.goto("/approvals");
    await approver.getByRole("button").filter({ hasText: "E2E Big Payee" }).click();
    await approver.getByRole("button", { name: "Approve", exact: true }).click();
    await approver.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
    await expect.poll(async () => (await state()).status).toBe("approved");
    expect((await state()).released_at).toBeNull();

    // Now the custodian can release.
    await custodian.reload();
    await custodian.getByRole("button", { name: "Release cash" }).click();
    await custodian.getByRole("dialog").getByRole("button", { name: "Release cash" }).click();
    await expect.poll(async () => (await state()).released_at).not.toBeNull();
  });
});
