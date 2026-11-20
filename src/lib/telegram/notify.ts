import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatPHP } from "@/lib/money";
import { shortRef } from "@/lib/refs";
import type { WorkflowDatabase } from "@/lib/workflow";

import { sendMessage, telegramConfigured } from "./api";

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type RequestSummary = { request_no: string; amount: number; purpose: string; status: string; review_note: string | null; approver_note: string | null };

// What the requester is told on Telegram when their request moves. Null when there is nothing to say.
export function requesterNotice(event: string, request: RequestSummary): string | null {
  const head = `${shortRef(request.request_no)} · ${formatPHP(request.amount)}\n📌 ${esc(request.purpose)}`;
  if (event === "budget.voucher_created") return `💵 <b>Handa na ang voucher ng request mo.</b>\n\n${head}\n\nMakipag-ugnayan sa custodian para sa pera.`;
  if (event !== "budget.reviewed") return null;
  if (request.status === "approved") return `✅ <b>Na-approve ang request mo!</b>\n\n${head}\n\nSusunod ang voucher mula sa custodian.`;
  if (request.status === "awaiting_approver") return `⏳ <b>Na-review na ng custodian.</b>\n\n${head}\n\nHinihintay na lang ang approver.`;
  if (request.status === "rejected") {
    const reason = request.approver_note || request.review_note;
    return `❌ <b>Hindi na-approve ang request mo.</b>\n\n${head}${reason ? `\n\nDahilan: ${esc(reason)}` : ""}`;
  }
  return null;
}

// Best effort: a person with no Telegram, or a Telegram that is down, must never break the action itself.
export async function tellPerson(profileId: string, text: string) {
  try {
    if (!telegramConfigured()) return;
    const db = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
    const link = await db.from("telegram_links").select("chat_id").eq("profile_id", profileId).maybeSingle();
    if (link.data) await sendMessage(Number(link.data.chat_id), text);
  } catch (error) {
    console.error("telegram notice failed", error instanceof Error ? error.message : "unknown error");
  }
}

export async function tellRequester(requesterId: string, event: string, request: RequestSummary) {
  const text = requesterNotice(event, request);
  if (text) await tellPerson(requesterId, text);
}
