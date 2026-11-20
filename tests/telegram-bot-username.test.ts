import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { resolveBotUsername } from "@/lib/telegram/api";

const telegram = (username?: string) => vi.fn().mockResolvedValue(new Response(JSON.stringify(username ? { ok: true, result: { username } } : { ok: false, description: "down" }), { status: username ? 200 : 502 }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("uses the name Telegram gives for the token, even when the setting holds the example placeholder", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "t"); vi.stubEnv("TELEGRAM_BOT_USERNAME", "YOUR_BOT_USERNAME");
  vi.stubGlobal("fetch", telegram("budgetReqBot"));
  expect(await resolveBotUsername()).toBe("budgetReqBot");
});

it("falls back to the setting only when Telegram cannot be reached, and never to a placeholder", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "t");
  vi.stubGlobal("fetch", telegram());
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "@budgetReqBot");
  expect(await resolveBotUsername()).toBe("budgetReqBot");
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "YOUR_BOT_USERNAME");
  expect(await resolveBotUsername()).toBeNull();
});
