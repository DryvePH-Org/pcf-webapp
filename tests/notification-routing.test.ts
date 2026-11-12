import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  inserted: [] as { table: string; rows: unknown }[],
  prefs: [] as { user_id: string; email_actions: boolean; email_digest: boolean }[],
  sentToday: 0,
}));

vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void task() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async (rows: unknown) => {
        store.inserted.push({ table, rows });
        return { error: null };
      },
      select: () => ({
        in: async () => ({ data: store.prefs, error: null }),
        eq: () => ({ gte: async () => ({ count: store.sentToday, error: null }) }),
      }),
    }),
  }),
}));

import { notify } from "@/lib/notifications/deliver";
import { personalItems } from "@/lib/notifications/digest";
import { decideReviewers } from "@/lib/notifications/routing";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  store.inserted = [];
  store.prefs = [];
  store.sentToday = 0;
});

describe("who reviews a request or liquidation", () => {
  const base = { custodianIds: ["c1", "c2"], approverIds: [] as string[], selfApproval: false };

  it("goes to the fund's other custodians for an ordinary requester", () => {
    expect(decideReviewers({ ...base, ownerId: "user" })).toEqual({ ids: ["c1", "c2"], selfApproved: false, fallbackToAdmin: false });
  });
  it("excludes the owner when the owner is a custodian", () => {
    expect(decideReviewers({ ...base, ownerId: "c1" }).ids).toEqual(["c2"]);
  });
  it("goes to the assigned approver for a custodian's own request", () => {
    expect(decideReviewers({ ...base, ownerId: "c1", approverIds: ["a1"] })).toEqual({ ids: ["a1"], selfApproved: false, fallbackToAdmin: false });
  });
  it("does not use the approver for an ordinary requester", () => {
    expect(decideReviewers({ ...base, ownerId: "user", approverIds: ["a1"] }).ids).toEqual(["c1", "c2"]);
  });
  it("needs nobody when the fund lets the custodian approve her own", () => {
    expect(decideReviewers({ ...base, ownerId: "c1", approverIds: ["a1"], selfApproval: true })).toEqual({ ids: [], selfApproved: true, fallbackToAdmin: false });
  });
  it("falls back to admins when nobody is left", () => {
    expect(decideReviewers({ custodianIds: ["c1"], approverIds: [], selfApproval: false, ownerId: "c1" }).fallbackToAdmin).toBe(true);
  });
});

describe("the daily summary for one person", () => {
  const data = {
    fund: new Map([["f1", { custodians: ["c1", "c2"], approvers: [], selfApproval: false }]]),
    requests: [{ fund_id: "f1", requester_id: "user" }, { fund_id: "f1", requester_id: "c1" }],
    liquidations: [
      { fund_id: "f1", owner_id: "user", status: "submitted" },
      { fund_id: "f1", owner_id: "user", status: "flagged" },
    ],
    due: [{ owner_id: "user", pcv_number: "PCV-2026-0004", overdue: true, due_at: "2026-11-12T00:00:00Z" }],
  };
  it("counts what a custodian has to review, without her own", () => {
    const text = personalItems("c1", "custodian", data).map((item) => item.text);
    expect(text).toEqual(["1 budget request waiting for your review", "1 liquidation waiting for your review"]);
  });
  it("tells the owner about corrections and a due liquidation", () => {
    const text = personalItems("user", "requester", data).map((item) => item.text);
    expect(text).toEqual(["1 liquidation sent back for your corrections", "Your liquidation for PCV-2026-0004 is overdue"]);
  });
});

describe("delivering a notification", () => {
  const recipient = { id: "11111111-1111-4111-8111-111111111111", email: "a@example.com", full_name: "Ana Cruz" };
  const content = () => ({ tone: "action" as const, heading: "Needs you", paragraphs: ["Please review."], cta: { label: "Open", path: "/requests/abc" } });

  it("always stores the in-app notification, even with email switched off", async () => {
    vi.stubEnv("NOTIFICATIONS_ENABLED", "false");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await notify({ event: "budget.submitted", recipients: [recipient], subject: "s", content });
    expect(fetcher).not.toHaveBeenCalled();
    const row = (store.inserted.find((entry) => entry.table === "notifications")?.rows as Record<string, unknown>[])[0];
    expect(row).toMatchObject({ user_id: recipient.id, title: "Needs you", tone: "action", link_path: "/requests/abc" });
  });

  it("does not email an in-app only event", async () => {
    vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "key");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await notify({ event: "voucher.approved", recipients: [recipient], subject: "s", content });
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.inserted.some((entry) => entry.table === "notifications")).toBe(true);
  });

  it("emails an action event and logs it", async () => {
    vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "key");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetcher);
    await notify({ event: "budget.submitted", recipients: [recipient], subject: "s", content });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const log = (store.inserted.find((entry) => entry.table === "notification_log")?.rows as Record<string, unknown>);
    expect(log.status).toBe("sent");
  });

  it("skips the email when the person turned it off, but keeps the bell", async () => {
    vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "key");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    store.prefs = [{ user_id: recipient.id, email_actions: false, email_digest: true }];
    await notify({ event: "budget.submitted", recipients: [recipient], subject: "s", content });
    expect(fetcher).not.toHaveBeenCalled();
    expect((store.inserted.find((entry) => entry.table === "notification_log")?.rows as Record<string, unknown>).status).toBe("skipped");
    expect(store.inserted.some((entry) => entry.table === "notifications")).toBe(true);
  });

  it("stops emailing at the daily limit but still shows the bell", async () => {
    vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("EMAIL_DAILY_LIMIT", "5");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    store.sentToday = 5;
    await notify({ event: "budget.submitted", recipients: [recipient], subject: "s", content });
    expect(fetcher).not.toHaveBeenCalled();
    expect((store.inserted.find((entry) => entry.table === "notification_log")?.rows as Record<string, unknown>).status).toBe("skipped");
  });

  it("still sends account emails when the limit is reached", async () => {
    vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("EMAIL_DAILY_LIMIT", "5");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetcher);
    store.sentToday = 5;
    await notify({ event: "user.welcome", recipients: [recipient], subject: "s", content });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
