import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true",
  "Set E2E_AUTHENTICATED=true to run against an isolated database.",
);
test.describe.configure({ mode: "serial" });

const APPLIED = "Voucher 0024, row 79: the tag was changed in the sheet from \"NCE - MEALS\" to \"NCE - REPRESENTATION\". The app now matches.";
const OPEN = "Voucher 0022, row 74: the sheet shows 465.00, and the app has no line of that voucher with this amount. Check whether it was edited or typed twice.";

test.beforeAll(async () => {
  assertSafeTarget();
  await cleanTestData();
  const db = adminClient();
  await db.from("sheet_edit_log").delete().eq("book_id", "buying");
  const inserted = await db.from("sheet_edit_log").insert([
    { book_id: "buying", voucher: "0024", kind: "tag_changed", summary: APPLIED, app_value: "NCE - MEALS", sheet_value: "NCE - REPRESENTATION", sheet_row: 79, applied: true },
    { book_id: "buying", voucher: "0022", kind: "amount_differs", summary: OPEN, app_value: "", sheet_value: "465", sheet_row: 74, applied: false },
  ]);
  expect(inserted.error).toBeNull();
});
test.afterAll(async () => {
  await adminClient().from("sheet_edit_log").delete().eq("book_id", "buying");
  await cleanTestData();
});

test("accounting sees what the app followed and what it could not (desktop)", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await cookiesFor("accounting", baseURL!));
  const page = await context.newPage();
  await page.goto("/accounting", { waitUntil: "networkidle" });
  await expect(page.getByText("Changes from the Google Sheet", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(APPLIED)).toBeVisible();
  await expect(page.getByText(OPEN)).toBeVisible();
  await expect(page.getByRole("heading", { name: "To check" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The app now matches the sheet" })).toBeVisible();
  await context.close();
});

test("on a phone it is closed until opened, and nobody else can read the log", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await context.addCookies(await cookiesFor("accounting", baseURL!));
  const page = await context.newPage();
  await page.goto("/accounting", { waitUntil: "networkidle" });
  await expect(page.getByText(APPLIED)).toBeHidden();
  await page.getByRole("button", { name: /^Changes from the Google Sheet \(2\)/ }).click();
  await expect(page.getByText(APPLIED)).toBeVisible();
  await context.close();

  // a custodian cannot read the log at all (it is for administrators and accounting)
  const { clientFor } = await import("./helpers");
  const custodian = await clientFor("custodian");
  const seen = await custodian.from("sheet_edit_log").select("id");
  expect(seen.data ?? []).toHaveLength(0);
});
