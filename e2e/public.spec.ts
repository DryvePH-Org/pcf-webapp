import { expect, test } from "@playwright/test";

test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send sign-in code" }),
  ).toBeVisible();
});

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("login page has no horizontal scroll", async ({ page }) => {
  await page.goto("/login");
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(fits).toBe(true);
});

test("health endpoint reports ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test("PWA manifest and offline page are public", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).short_name).toBe("Petty Cash");

  const offline = await request.get("/offline.html");
  expect(offline.status()).toBe(200);
  expect(await offline.text()).toContain("You're offline");
});

test("responses carry the security headers and a nonce-based CSP", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/login`);
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBeTruthy();
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["x-powered-by"]).toBeUndefined();
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src [^;]*'nonce-/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
});
