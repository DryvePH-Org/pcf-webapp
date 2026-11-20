import { createServer, type Server } from "node:http";

import { expect, test } from "@playwright/test";

import { adminClient, assertSafeTarget, cleanTestData, clientFor, cookiesFor } from "./helpers";

test.skip(
  process.env.E2E_AUTHENTICATED !== "true" || !process.env.TELEGRAM_API_BASE,
  "Needs the isolated database and the app started with the Telegram test settings (see docs/ops/phase54-telegram-rollout.md).",
);
test.describe.configure({ mode: "serial" });

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "test-secret";
const CHAT = 424242;
const PORT = Number(new URL(process.env.TELEGRAM_API_BASE ?? "http://127.0.0.1:3399").port);

// A stand-in for Telegram, ElevenLabs and Groq that records what the app sends and answers like the real ones.
type Call = { kind: "send" | "edit" | "answer"; chat?: number; message?: number; text?: string; buttons: string[]; callbacks: string[] };
let calls: Call[] = [];
let transcript = "";
let nextMessage = 500;
let server: Server;

function startFake() {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const reply = (body: unknown, type = "application/json") => {
        res.writeHead(200, { "Content-Type": type });
        res.end(typeof body === "string" ? body : JSON.stringify(body));
      };
      const url = req.url ?? "";
      if (url.startsWith("/__")) return reply({ calls });
      if (url.includes("/file/bot")) return reply("OggS-fake-audio", "audio/ogg");
      if (url.startsWith("/v1/speech-to-text")) return reply({ text: transcript, language_code: "fil" });
      if (url.startsWith("/openai/v1/chat/completions")) {
        // reads the amount like a model would: the first number in what was said
        const said = JSON.parse(JSON.parse(raw.toString()).messages[1].content).transcript as string;
        const amount = /(\d[\d,]*)/.exec(said)?.[1].replace(/,/g, "");
        return reply({ choices: [{ message: { content: JSON.stringify({ amount: amount ? `${amount}.00` : "", purpose: said.slice(0, 300), fund_id: "" }) } }] });
      }
      const method = /\/bot[^/]+\/(\w+)/.exec(url)?.[1];
      const body = raw.length ? JSON.parse(raw.toString()) : {};
      const buttons = (body.reply_markup?.inline_keyboard ?? []).flat();
      if (method === "sendMessage") {
        calls.push({ kind: "send", chat: body.chat_id, text: body.text, buttons: buttons.map((b: { text: string }) => b.text), callbacks: buttons.map((b: { callback_data: string }) => b.callback_data) });
        return reply({ ok: true, result: { message_id: nextMessage++ } });
      }
      if (method === "editMessageText") {
        calls.push({ kind: "edit", chat: body.chat_id, message: body.message_id, text: body.text, buttons: buttons.map((b: { text: string }) => b.text), callbacks: buttons.map((b: { callback_data: string }) => b.callback_data) });
        return reply({ ok: true, result: true });
      }
      if (method === "answerCallbackQuery") return reply({ ok: true, result: true });
      if (method === "getWebhookInfo") return reply({ ok: true, result: { url: "", pending_update_count: 0 } });
      if (method === "setWebhook") return reply({ ok: true, result: true });
      if (method === "getFile") return reply({ ok: true, result: { file_path: "voice/file_1.oga", file_size: 2000 } });
      return reply({ ok: false, description: "unknown method" });
    });
  });
  return new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));
}

const heard = (text: string, kind?: Call["kind"]) => calls.some((call) => (!kind || call.kind === kind) && call.text?.includes(text));
async function until(condition: () => boolean | Promise<boolean>, what: string) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for: ${what}\n${JSON.stringify(calls.slice(-4), null, 1)}`);
}

test.describe("asking for a budget by Telegram (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Uses the desktop layout.");
  // Telegram numbers its updates upward and the bot ignores one it has seen, so each run starts above the last.
  let updateId = Date.now();
  let requesterId: string;
  let requestId: string;
  const tag = Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

  const post = (request: import("@playwright/test").APIRequestContext, body: object, secret: string | null = SECRET) =>
    request.post("/api/telegram/webhook", { data: { update_id: updateId++, ...body }, headers: secret === null ? {} : { "x-telegram-bot-api-secret-token": secret } });
  const message = (extra: object, chat = CHAT) => ({ message: { message_id: 1, chat: { id: chat, type: "private" }, from: { username: "maria_test" }, ...extra } });
  const press = (data: string, messageId: number) => ({ callback_query: { id: `cb${updateId}`, data, message: { message_id: messageId, chat: { id: CHAT, type: "private" } } } });
  const openDraft = async () => (await adminClient().from("telegram_drafts").select("id, status, amount, message_id, request_id").eq("chat_id", CHAT).order("created_at", { ascending: false }).limit(1).single()).data!;

  test.beforeAll(async () => {
    assertSafeTarget();
    await cleanTestData();
    await adminClient().from("telegram_links").delete().eq("chat_id", CHAT);
    await adminClient().from("telegram_drafts").delete().eq("chat_id", CHAT);
    const accounting = await clientFor("accounting");
    requesterId = (await accounting.auth.getUser()).data.user!.id;
    await adminClient().from("telegram_links").delete().eq("profile_id", requesterId);
    await startFake();
  });
  test.afterAll(async () => {
    server?.close();
    await cleanTestData();
    await adminClient().from("telegram_links").delete().eq("chat_id", CHAT);
    await adminClient().from("telegram_drafts").delete().eq("chat_id", CHAT);
  });
  test.beforeEach(() => {
    calls = [];
  });

  test("only Telegram, with the secret, can use the address", async ({ request }) => {
    expect((await post(request, message({ text: "/help" }), "wrong-secret")).status()).toBe(401);
    expect((await post(request, message({ text: "/help" }), null)).status()).toBe(401);
  });

  test("a person who is not linked is told to ask the admin and nothing is made", async ({ request }) => {
    expect((await post(request, message({ text: "800 para sa gasolina" }, 999001))).status()).toBe(200);
    await until(() => heard("Hindi pa naka-link", "send"), "the not-linked message");
    expect((await adminClient().from("telegram_drafts").select("id").eq("chat_id", 999001)).data).toHaveLength(0);
  });

  test("link, speak, correct, submit, and hear the answer", async ({ request, browser, baseURL }) => {
    // the administrator makes the one-tap link; the person taps it
    const admin = await clientFor("admin");
    const code = await admin.rpc("telegram_issue_link_code", { p_user: requesterId });
    expect(code.error).toBeNull();
    await post(request, message({ text: `/start ${code.data}` }));
    await until(() => heard("Naka-link ka na", "send"), "the welcome");
    expect((await adminClient().from("telegram_links").select("chat_id").eq("profile_id", requesterId).single()).data?.chat_id).toBe(CHAT);

    // a voice message becomes a summary with the buttons
    calls = [];
    transcript = `Kailangan ko ng 800 para sa gasolina ${tag}`;
    await post(request, message({ voice: { file_id: "abc", duration: 6, file_size: 20000 } }));
    await until(() => heard("₱800.00", "edit"), "the summary with 800");
    const summary = calls.find((call) => call.kind === "edit" && call.text?.includes("₱800.00"))!;
    expect(summary.text).toContain(tag);
    expect(summary.buttons).toContain("✅ Submit");
    const draft = await openDraft();
    expect(Number(draft.amount)).toBe(800);

    // the amount is corrected by tapping and saying it
    calls = [];
    await post(request, press(`amt:${draft.id}`, Number(draft.message_id)));
    await until(() => heard("halaga", "send"), "the prompt for the amount");
    transcript = "ang tama ay 950";
    await post(request, message({ voice: { file_id: "def", duration: 3, file_size: 8000 } }));
    await until(() => heard("₱950.00"), "the corrected summary");
    const corrected = await openDraft();
    expect(Number(corrected.amount)).toBe(950);

    // Submit makes an ordinary budget request, by this person
    const latest = [...calls].reverse().find((call) => call.text?.includes("₱950.00") && call.callbacks.some((c) => c.startsWith("submit:")))!;
    calls = [];
    await post(request, press(`submit:${corrected.id}`, Number(corrected.message_id ?? 0)));
    await until(() => heard("Naipasa na ang request mo"), "the confirmation");
    expect(latest).toBeTruthy();
    const made = await adminClient().from("budget_requests").select("id, amount, status, requester_id, purpose").eq("requester_id", requesterId).order("created_at", { ascending: false }).limit(1).single();
    expect(made.data).toMatchObject({ amount: 950, status: "submitted", requester_id: requesterId });
    expect(made.data?.purpose).toContain(tag);
    requestId = made.data!.id;
    expect((await openDraft()).request_id).toBe(requestId);

    // a second tap does not make a second request
    await post(request, press(`submit:${corrected.id}`, Number(corrected.message_id ?? 0)));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect((await adminClient().from("budget_requests").select("id").eq("requester_id", requesterId)).data).toHaveLength(1);

    // the custodian approves it on the website, and the requester hears it on Telegram
    calls = [];
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("custodian", baseURL!));
    const page = await context.newPage();
    await page.goto(`/requests/${requestId}`);
    await expect(page.getByText("sent by Telegram")).toBeVisible();
    await page.getByRole("button", { name: "Approve request" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve request" }).click();
    await until(() => heard("Na-approve ang request mo", "send"), "the approval message on Telegram");
    await context.close();
  });

  test("the rules of the website apply: an amount over the fund's limit is refused with the reason and the draft stays", async ({ request }) => {
    calls = [];
    transcript = `Kailangan ko ng 5000 para sa kagamitan ${tag}x`;
    await post(request, message({ voice: { file_id: "ghi", duration: 5, file_size: 15000 } }));
    await until(() => heard("₱5,000.00", "edit"), "the summary with 5000");
    const draft = await openDraft();
    calls = [];
    await post(request, press(`submit:${draft.id}`, Number(draft.message_id)));
    await until(() => heard("This fund allows at most", "send"), "the reason from the rules");
    expect((await openDraft()).status).toBe("draft");
    expect((await adminClient().from("budget_requests").select("id").eq("requester_id", requesterId).eq("amount", 5000)).data).toHaveLength(0);
  });

  test("the administrator makes a person's link on the Telegram page", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(await cookiesFor("admin", baseURL!));
    const page = await context.newPage();
    await page.goto("/admin/telegram");
    await expect(page.getByRole("heading", { name: "Telegram" })).toBeVisible();
    await expect(page.getByText("@pcf_test_bot")).toBeVisible();
    await page.getByRole("button", { name: /Make link|New link/ }).first().click();
    await expect(page.locator("code").first()).toContainText("https://t.me/pcf_test_bot?start=");
    // Telegram only talks to a secure address; this test site is plain http, so connecting says so
    await page.getByRole("button", { name: "Connect the bot to this site" }).click();
    await expect(page.getByText(/must be https/)).toBeVisible();
    await context.close();
  });
});
