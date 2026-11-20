import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { safeDbMessage } from "@/lib/db-error";
import { shortRef } from "@/lib/refs";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowDatabase } from "@/lib/workflow";

import type { Deps, Draft, DraftPatch } from "./flow";

const db = () => createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
const OPEN = ["draft", "editing_amount", "editing_purpose"];

type DraftRow = Awaited<ReturnType<typeof readDraft>>;
async function readDraft(chatId: number) {
  const { data, error } = await db().from("telegram_drafts").select("*").eq("chat_id", chatId).in("status", OPEN).maybeSingle();
  if (error) throw new Error("Could not read the draft.");
  return data;
}
const toDraft = (row: NonNullable<DraftRow>): Draft => ({
  id: row.id,
  chat_id: Number(row.chat_id),
  profile_id: row.profile_id,
  fund_id: row.fund_id,
  amount: row.amount === null ? null : Number(row.amount),
  purpose: row.purpose,
  transcript: row.transcript,
  status: row.status as Draft["status"],
  message_id: row.message_id === null ? null : Number(row.message_id),
});

export const telegramStore: Deps["store"] = {
  async firstSeen(updateId) {
    const { error } = await db().from("telegram_updates").insert({ update_id: updateId });
    if (!error) {
      // keep the table small: a week of ids is far more than Telegram ever resends
      if (updateId % 50 === 0) await db().from("telegram_updates").delete().lt("received_at", new Date(Date.now() - 7 * 86400000).toISOString());
      return true;
    }
    if (error.code === "23505") return false;
    throw new Error("Could not record the update.");
  },

  async profileOf(chatId) {
    const link = await db().from("telegram_links").select("profile_id").eq("chat_id", chatId).maybeSingle();
    if (link.error) throw new Error("Could not read the link.");
    if (!link.data) return null;
    const profile = await db().from("profiles").select("id, full_name, is_active").eq("id", link.data.profile_id).maybeSingle();
    if (profile.error) throw new Error("Could not read the account.");
    return profile.data?.is_active ? { id: profile.data.id, name: profile.data.full_name } : null;
  },

  async redeem(code, chatId, username) {
    const { data, error } = await db().rpc("telegram_redeem_link_code", { p_code: code, p_chat: chatId, p_username: username });
    if (error || !data?.[0]) throw new Error(error ? safeDbMessage(error) : "Link not accepted");
    return { id: data[0].profile_id, name: data[0].full_name };
  },

  // The funds a person can ask a budget from: active funds that have an active custodian to review the request, each
  // with the custodians' names (the people to ask about that fund).
  async funds() {
    const [funds, links, people] = await Promise.all([
      db().from("funds").select("id, name").eq("is_active", true).order("name"),
      db().from("fund_custodians").select("fund_id, custodian_id"),
      db().from("profiles").select("id, full_name").eq("role", "custodian").eq("is_active", true).order("full_name"),
    ]);
    if (funds.error || links.error || people.error) throw new Error("Could not read the funds.");
    const names = new Map((people.data ?? []).map((row) => [row.id, row.full_name]));
    const custodiansOf = (fundId: string) =>
      (links.data ?? []).filter((row) => row.fund_id === fundId && names.has(row.custodian_id)).map((row) => names.get(row.custodian_id) as string).sort();
    return (funds.data ?? []).map((fund) => ({ id: fund.id, name: fund.name, custodians: custodiansOf(fund.id) })).filter((fund) => fund.custodians.length > 0);
  },

  async lastFund(profileId) {
    const { data } = await db().from("budget_requests").select("fund_id").eq("requester_id", profileId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data?.fund_id ?? null;
  },

  async openDraft(chatId) {
    const row = await readDraft(chatId);
    return row ? toDraft(row) : null;
  },

  async newDraft(input) {
    // only one request is open in a chat: a new voice message replaces an unfinished one
    await db().from("telegram_drafts").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("chat_id", input.chatId).in("status", OPEN);
    const { data, error } = await db()
      .from("telegram_drafts")
      .insert({
        chat_id: input.chatId,
        profile_id: input.profileId,
        fund_id: input.fundId,
        amount: input.amount,
        purpose: input.purpose,
        transcript: input.transcript.slice(0, 5000),
        message_id: input.messageId,
      })
      .select("*")
      .single();
    if (error || !data) throw new Error("Could not save the draft.");
    return toDraft(data);
  },

  async updateDraft(id, patch: DraftPatch) {
    const { data, error } = await db().from("telegram_drafts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error || !data) throw new Error("Could not update the draft.");
    return toDraft(data);
  },

  async claimSubmit(id) {
    const { data, error } = await db().from("telegram_drafts").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "draft").select("id");
    if (error) throw new Error("Could not claim the draft.");
    return (data ?? []).length === 1;
  },

  async releaseSubmit(id) {
    await db().from("telegram_drafts").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "submitted").is("request_id", null);
  },

  async finishDraft(id, requestId) {
    await db().from("telegram_drafts").update({ request_id: requestId, updated_at: new Date().toISOString() }).eq("id", id);
  },

  async cancelDraft(id) {
    await db().from("telegram_drafts").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).in("status", OPEN);
  },

  async createRequest(profileId, fundId, amount, purpose) {
    // the same rules as the website: this is create_budget_request, run as the linked person
    const { data, error } = await db().rpc("telegram_create_budget_request", { p_user: profileId, p_fund: fundId, p_amount: amount, p_purpose: purpose });
    if (error || !data) throw new Error(error ? safeDbMessage(error) : "The request was not saved.");
    const request = await db().from("budget_requests").select("request_no").eq("id", data).maybeSingle();
    return { id: data, ref: shortRef(request.data?.request_no ?? "") };
  },
};
