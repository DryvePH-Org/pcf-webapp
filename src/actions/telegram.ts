"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { actionError, type ActionResult } from "@/lib/action-result";
import { getAdminUser } from "@/lib/auth";
import { safeDbMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { resolveBotUsername, setWebhook, telegramConfigured } from "@/lib/telegram/api";
import type { WorkflowDatabase } from "@/lib/workflow";

const person = z.object({ userId: z.uuid() });

// The one-tap link an administrator sends to a requester. The code inside it works once and expires in 7 days.
export async function createTelegramLink(input: z.input<typeof person>): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Only administrators can do this." };
  const parsed = person.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a person." };
  if (!telegramConfigured()) return { ok: false, error: "Connect the Telegram bot first (the settings are not on the server yet)." };
  const username = await resolveBotUsername();
  if (!username) return { ok: false, error: "The bot could not be reached. Check its token." };
  const db = (await createClient()) as unknown as SupabaseClient<WorkflowDatabase>;
  const { data, error } = await db.rpc("telegram_issue_link_code", { p_user: parsed.data.userId });
  if (error || !data) return { ok: false, error: error ? safeDbMessage(error) : "Could not make the link." };
  revalidatePath("/admin/telegram");
  return { ok: true, link: `https://t.me/${username}?start=${data}` };
}

export async function unlinkTelegram(input: z.input<typeof person>): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return actionError("Only administrators can do this.");
  const parsed = person.safeParse(input);
  if (!parsed.success) return actionError("Choose a person.");
  const db = (await createClient()) as unknown as SupabaseClient<WorkflowDatabase>;
  const { error } = await db.rpc("telegram_unlink", { p_user: parsed.data.userId });
  if (error) return actionError(safeDbMessage(error));
  revalidatePath("/admin/telegram");
  return { ok: true };
}

// Tells Telegram where to send messages (this site) and the secret to prove they came from it.
export async function connectTelegramBot(): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return actionError("Only administrators can do this.");
  if (!telegramConfigured()) return actionError("The bot token and secret are not on the server yet.");
  const base = process.env.APP_URL;
  if (!base || !base.startsWith("https://")) return actionError("The site address (APP_URL) must be https for Telegram.");
  try {
    await setWebhook(`${base.replace(/\/$/, "")}/api/telegram/webhook`, process.env.TELEGRAM_WEBHOOK_SECRET ?? "");
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Telegram did not accept the address.");
  }
  revalidatePath("/admin/telegram");
  return { ok: true };
}
