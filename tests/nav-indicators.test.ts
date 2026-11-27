import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/grokbot/queue-data", () => ({ loadSheetQueue: vi.fn() }));
vi.mock("@/lib/settlements-due", () => ({ settlementBadgeCount: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { navHrefFor } from "@/lib/nav-indicators";

const HREFS = ["/dashboard", "/requests", "/vouchers", "/liquidations", "/settlements"];

describe("navHrefFor", () => {
  it("puts a notification under the menu page its link belongs to", () => {
    expect(navHrefFor("/requests", HREFS)).toBe("/requests");
    expect(navHrefFor("/requests/abc-123", HREFS)).toBe("/requests");
    expect(navHrefFor("/liquidations/abc?tab=lines", HREFS)).toBe("/liquidations");
  });

  it("does not match a page that only shares the start of the name", () => {
    expect(navHrefFor("/requests-old/1", HREFS)).toBeNull();
    expect(navHrefFor("/voucher", HREFS)).toBeNull();
  });

  it("prefers the longest menu page and ignores a missing link", () => {
    expect(navHrefFor("/admin/users/1", ["/admin", "/admin/users"])).toBe("/admin/users");
    expect(navHrefFor(null, HREFS)).toBeNull();
    expect(navHrefFor("/elsewhere", HREFS)).toBeNull();
  });
});
