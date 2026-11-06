import { afterEach, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email";
import { notify } from "@/lib/notifications/deliver";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("does not call the email API when delivery is disabled", async () => {
  vi.stubEnv("NOTIFICATIONS_ENABLED", "false");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(sendEmail({ to: "test@example.com", subject: "test", html: "", text: "" })).rejects.toThrow("disabled");
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not report disabled notification attempts as sent", async () => {
  vi.stubEnv("NOTIFICATIONS_ENABLED", "false");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await notify({ event: "digest.daily", recipients: [{ id: null, email: "test@example.com", full_name: "Test" }], subject: "test", content: () => ({ tone: "info", heading: "Test", paragraphs: [] }) });
  expect(fetcher).not.toHaveBeenCalled();
});
