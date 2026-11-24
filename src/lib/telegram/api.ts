import "server-only";

// A small client for the Telegram Bot API. TELEGRAM_API_BASE exists only so tests can point at a local stand-in;
// production leaves it unset. Errors never carry the bot token (it is part of the request address).
const base = () => process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
const token = () => process.env.TELEGRAM_BOT_TOKEN ?? "";

export type Button = { text: string; callback_data: string };
export type Markup = { inline_keyboard: Button[][] };

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET);
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base()}/bot${token()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error(`Telegram ${method} could not be reached`);
  }
  const json = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!response.ok || !json?.ok) throw new Error(`Telegram ${method} failed: ${json?.description ?? response.status}`);
  return json.result as T;
}

export async function sendMessage(chatId: number, text: string, markup?: Markup): Promise<number> {
  const result = await call<{ message_id: number }>("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", reply_markup: markup });
  return result.message_id;
}

// Editing a message can fail harmlessly (it was deleted, or the text did not change).
export async function editMessage(chatId: number, messageId: number, text: string, markup?: Markup): Promise<void> {
  try {
    await call("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: markup ?? { inline_keyboard: [] } });
  } catch (error) {
    if (!/not modified|not found/i.test(error instanceof Error ? error.message : "")) throw error;
  }
}

export async function answerCallback(callbackId: string, text?: string): Promise<void> {
  try {
    await call("answerCallbackQuery", { callback_query_id: callbackId, text });
  } catch {
    // an expired button press is not worth failing the update for
  }
}

const MAX_VOICE_BYTES = 10 * 1024 * 1024;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

async function downloadFile(fileId: string, maxBytes: number, type: string, what: string): Promise<Blob> {
  const info = await call<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!info.file_path) throw new Error(`Telegram has no file for that ${what}`);
  if ((info.file_size ?? 0) > maxBytes) throw new Error(`That ${what} is too large`);
  let response: Response;
  try {
    response = await fetch(`${base()}/file/bot${token()}/${info.file_path}`, { signal: AbortSignal.timeout(30000) });
  } catch {
    throw new Error("Telegram file could not be reached");
  }
  if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error(`That ${what} is too large`);
  return new Blob([bytes], { type });
}

export const downloadVoice = (fileId: string): Promise<Blob> => downloadFile(fileId, MAX_VOICE_BYTES, "audio/ogg", "recording");
// Telegram turns a sent picture into a JPEG of at most about 1280 pixels, so it is already receipt-sized.
export const downloadPhoto = (fileId: string): Promise<Blob> => downloadFile(fileId, MAX_PHOTO_BYTES, "image/jpeg", "picture");

export async function setWebhook(url: string, secret: string): Promise<void> {
  await call("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
}

// The Menu button in the chat lists these, so nobody has to remember a command.
export async function setMenuCommands(): Promise<void> {
  await call("setMyCommands", {
    commands: [
      { command: "liquidate", description: "Mag-liquidate: i-send ang larawan ng resibo" },
      { command: "help", description: "Tulong: paano gamitin" },
      { command: "cancel", description: "Kanselahin ang ginagawa" },
    ],
  });
  await call("setChatMenuButton", { menu_button: { type: "commands" } });
}

export async function webhookInfo(): Promise<{ url: string; pending_update_count: number; last_error_message?: string }> {
  return call("getWebhookInfo", {});
}

export async function botName(): Promise<string | null> {
  try {
    return (await call<{ username?: string }>("getMe", {})).username ?? null;
  } catch {
    return null;
  }
}

// The bot's real @username comes from Telegram itself (the token decides it), so a setting copied from the example
// ("YOUR_BOT_USERNAME") can never put a wrong name into the link. The setting is only the fallback if Telegram
// cannot be reached, and a placeholder or a leading @ is never used as is.
export async function resolveBotUsername(): Promise<string | null> {
  const asked = await botName();
  if (asked) return asked;
  const configured = (process.env.TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(configured) && !/^your[_-]?bot/i.test(configured) ? configured : null;
}
