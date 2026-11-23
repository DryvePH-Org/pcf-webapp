import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { safeDbMessage } from "@/lib/db-error";
import { extractPhilippineReceipt } from "@/lib/receipt-extraction";
import { createAdminClient } from "@/lib/supabase/admin";

import type { LiqDeps, LiqDraft, LiqLine, Outstanding } from "./liquidation-flow";

// The tables here are private to the server and are not in the generated types.
const db = () => createAdminClient() as unknown as SupabaseClient;
const OPEN = ["choosing", "draft", "editing_particulars", "editing_amount", "editing_department"];
// a half-finished liquidation left in a chat is dropped after two days instead of catching tomorrow's photos
const STALE_MS = 2 * 86400000;

const toDraft = (row: Record<string, unknown>): LiqDraft => ({
  id: row.id as string,
  chat_id: Number(row.chat_id),
  profile_id: row.profile_id as string,
  voucher_id: (row.voucher_id as string | null) ?? null,
  liquidation_id: (row.liquidation_id as string | null) ?? null,
  department: (row.department as string) ?? "",
  status: row.status as LiqDraft["status"],
  edit_line: (row.edit_line as string | null) ?? null,
  message_id: row.message_id === null || row.message_id === undefined ? null : Number(row.message_id),
  pending_file: (row.pending_file as string | null) ?? null,
  pending_caption: (row.pending_caption as string | null) ?? null,
});
const toLine = (row: Record<string, unknown>): LiqLine => ({
  id: row.id as string,
  particulars: (row.particulars as string) ?? "",
  amount: row.amount === null ? null : Number(row.amount),
  receipt_path: (row.receipt_path as string | null) ?? null,
  read_amount: row.read_amount === null ? null : Number(row.read_amount),
  reading: Boolean(row.reading),
});

async function lastDepartment(profileId: string): Promise<string> {
  const { data } = await db().from("liquidations").select("department").eq("owner_id", profileId).neq("department", "").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.department as string | undefined) ?? "";
}

async function openLiquidation(profileId: string, voucherId: string): Promise<string> {
  const { data, error } = await db().rpc("telegram_create_liquidation", { p_user: profileId, p_voucher: voucherId });
  if (error || !data) throw new Error(error ? safeDbMessage(error) : "Hindi nabuksan ang liquidation.");
  return data as string;
}

export const telegramLiquidationStore: LiqDeps["store"] = {
  async outstanding(profileId) {
    const view = await db().from("outstanding_liquidations_v").select("voucher_id, pcv_number, fund_name, amount, overdue, liquidation_id, liquidation_status, released_at").eq("owner_id", profileId).order("released_at", { ascending: true });
    if (view.error) throw new Error("Could not read your advances.");
    const rows = view.data ?? [];
    const ids = rows.map((row) => row.liquidation_id as string | null).filter((id): id is string => Boolean(id));
    // receipts already attached on the website: the person started it there, so it is finished there
    const started = new Set<string>();
    if (ids.length) {
      const items = await db().from("liquidation_items").select("liquidation_id").in("liquidation_id", ids).not("receipt_path", "is", null);
      if (items.error) throw new Error("Could not read your advances.");
      for (const item of items.data ?? []) started.add(item.liquidation_id as string);
    }
    return rows.map((row): Outstanding => ({
      voucher_id: row.voucher_id as string,
      pcv_number: (row.pcv_number as string) ?? "",
      fund_name: (row.fund_name as string) ?? "",
      amount: Number(row.amount),
      overdue: Boolean(row.overdue),
      elsewhere: !["not_filed", "draft"].includes(row.liquidation_status as string) || started.has(row.liquidation_id as string),
    }));
  },

  async openDraft(chatId) {
    await db().from("telegram_liq_drafts").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("chat_id", chatId).in("status", OPEN).lt("updated_at", new Date(Date.now() - STALE_MS).toISOString());
    const { data, error } = await db().from("telegram_liq_drafts").select("*").eq("chat_id", chatId).in("status", OPEN).maybeSingle();
    if (error) throw new Error("Could not read the liquidation.");
    return data ? toDraft(data) : null;
  },

  async begin(input) {
    // the advance is opened first, so a refusal leaves nothing behind
    const liquidationId = input.voucherId ? await openLiquidation(input.profileId, input.voucherId) : null;
    await db().from("telegram_liq_drafts").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("chat_id", input.chatId).in("status", OPEN);
    const { data, error } = await db()
      .from("telegram_liq_drafts")
      .insert({
        chat_id: input.chatId,
        profile_id: input.profileId,
        voucher_id: input.voucherId,
        liquidation_id: liquidationId,
        department: await lastDepartment(input.profileId),
        status: input.voucherId ? "draft" : "choosing",
        pending_file: input.pendingFile,
        pending_caption: input.pendingCaption?.slice(0, 600) ?? null,
      })
      .select("*")
      .single();
    if (error || !data) throw new Error("Could not save the liquidation.");
    return toDraft(data);
  },

  async choose(draft, profileId, voucherId) {
    const liquidationId = await openLiquidation(profileId, voucherId);
    const { data, error } = await db().from("telegram_liq_drafts").update({ voucher_id: voucherId, liquidation_id: liquidationId, status: "draft", pending_file: null, pending_caption: null, updated_at: new Date().toISOString() }).eq("id", draft.id).eq("status", "choosing").select("*").single();
    if (error || !data) throw new Error("Could not save the liquidation.");
    // the caller still needs the photo that was waiting for this choice
    return { ...toDraft(data), pending_file: draft.pending_file, pending_caption: draft.pending_caption };
  },

  async updateDraft(id, patch) {
    const { data, error } = await db().from("telegram_liq_drafts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error || !data) throw new Error("Could not update the liquidation.");
    return toDraft(data);
  },

  async lines(draftId) {
    const { data, error } = await db().from("telegram_liq_lines").select("*").eq("draft_id", draftId).order("created_at", { ascending: true }).order("id", { ascending: true });
    if (error) throw new Error("Could not read the receipts.");
    return (data ?? []).map(toLine);
  },

  async addLine(input) {
    const { data, error } = await db().from("telegram_liq_lines").insert({ id: input.id, draft_id: input.draftId, particulars: input.particulars, amount: input.amount, receipt_path: input.receiptPath, reading: input.reading }).select("*").single();
    if (error || !data) throw new Error("Could not save the receipt.");
    return toLine(data);
  },

  async updateLine(id, patch) {
    const { error } = await db().from("telegram_liq_lines").update(patch).eq("id", id);
    if (error) throw new Error("Could not update the receipt.");
  },

  async removeLine(id) {
    await db().from("telegram_liq_lines").delete().eq("id", id);
  },

  async setRead(id, amount) {
    await db().from("telegram_liq_lines").update({ read_amount: amount, reading: false }).eq("id", id);
    if (amount) await db().from("telegram_liq_lines").update({ amount }).eq("id", id).is("amount", null);
  },

  async claimSubmit(id) {
    const { data, error } = await db().from("telegram_liq_drafts").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", id).in("status", ["draft", "editing_particulars", "editing_amount", "editing_department"]).select("id");
    if (error) throw new Error("Could not claim the liquidation.");
    return (data ?? []).length === 1;
  },

  async releaseSubmit(id) {
    await db().from("telegram_liq_drafts").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "submitted");
  },

  async submit(draft, lines) {
    if (!draft.liquidation_id) throw new Error("Walang liquidation na bubuksan.");
    const items = lines.map((line) => ({ id: line.id, particulars: line.particulars, amount: line.amount, receipt_path: line.receipt_path, no_receipt_reason: "" }));
    const saved = await db().rpc("telegram_save_liquidation", { p_user: draft.profile_id, p_id: draft.liquidation_id, p_department: draft.department, p_items: items });
    if (saved.error) throw new Error(safeDbMessage(saved.error));
    const sent = await db().rpc("telegram_submit_liquidation", { p_user: draft.profile_id, p_id: draft.liquidation_id });
    if (sent.error) throw new Error(safeDbMessage(sent.error));
  },

  async cancel(id) {
    await db().from("telegram_liq_drafts").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).in("status", OPEN);
  },
};

// Receipt reading is limited to a few pictures a minute on the plan we have, so the pictures are read one after the
// other, however many people send them at the same moment.
let readingChain: Promise<unknown> = Promise.resolve();
function inLine<T>(work: () => Promise<T>): Promise<T> {
  const next = readingChain.then(work, work);
  readingChain = next.catch(() => undefined);
  return next;
}

export const telegramLiquidationFiles: LiqDeps["files"] = {
  photo: (fileId) => import("./api").then((api) => api.downloadPhoto(fileId)),
  async upload(liquidationId, lineId, picture) {
    const path = `${liquidationId}/${lineId}/${crypto.randomUUID()}.jpg`;
    const { error } = await createAdminClient().storage.from("liquidation-receipts").upload(path, picture, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error("Hindi na-save ang larawan ng resibo. Subukan ulit.");
    return path;
  },
  read: (picture) => inLine(async () => (await extractPhilippineReceipt(picture, [])).suggestion.amount),
};
