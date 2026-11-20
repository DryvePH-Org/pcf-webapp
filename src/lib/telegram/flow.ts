import { z } from "zod";

import { formatPHP } from "@/lib/money";
import { createBudgetRequestSchema } from "@/lib/validators/budget-request";
import { cleanText } from "@/lib/validators/text";
import { guessAmount, type FundChoice, type SpokenRequest } from "@/lib/voice/extract-request";

// The conversation a requester has with the bot: a voice message becomes a summary, buttons correct it, and
// Submit makes an ordinary budget request. Every outside thing (Telegram, the database, speech to text) comes
// in through Deps, so the whole conversation can be tested with stand-ins.

export type Button = { text: string; callback_data: string };
export type Markup = { inline_keyboard: Button[][] };

export type Draft = {
  id: string;
  chat_id: number;
  profile_id: string;
  fund_id: string | null;
  amount: number | null;
  purpose: string | null;
  transcript: string | null;
  status: "draft" | "editing_amount" | "editing_purpose";
  message_id: number | null;
};
export type DraftPatch = Partial<{ fund_id: string | null; amount: number | null; purpose: string | null; status: Draft["status"]; message_id: number | null }>;
export type Person = { id: string; name: string };

export type Deps = {
  store: {
    firstSeen(updateId: number): Promise<boolean>;
    profileOf(chatId: number): Promise<Person | null>;
    redeem(code: string, chatId: number, username: string | null): Promise<Person>;
    funds(): Promise<FundChoice[]>;
    openDraft(chatId: number): Promise<Draft | null>;
    newDraft(input: { chatId: number; profileId: string; fundId: string | null; amount: number | null; purpose: string | null; transcript: string; messageId: number | null }): Promise<Draft>;
    updateDraft(id: string, patch: DraftPatch): Promise<Draft>;
    // true only for the one caller that wins; a second tap on Submit gets false
    claimSubmit(id: string): Promise<boolean>;
    releaseSubmit(id: string): Promise<void>;
    finishDraft(id: string, requestId: string): Promise<void>;
    cancelDraft(id: string): Promise<void>;
    createRequest(profileId: string, fundId: string, amount: number, purpose: string): Promise<{ id: string; ref: string }>;
  };
  tg: {
    send(chatId: number, text: string, markup?: Markup): Promise<number>;
    edit(chatId: number, messageId: number, text: string, markup?: Markup): Promise<void>;
    answer(callbackId: string, text?: string): Promise<void>;
    voice(fileId: string): Promise<Blob>;
  };
  voice: {
    transcribe(file: Blob, name: string): Promise<string>;
    extract(transcript: string, funds: FundChoice[]): Promise<SpokenRequest>;
  };
  limit(key: string, count: number, windowSeconds: number): Promise<boolean>;
  // true when the same request was just made (a double tap, a retry)
  repeat(profileId: string, payload: unknown): Promise<boolean>;
  // tell the reviewers, after the request exists
  afterRequest(requestId: string, profileId: string): void;
};

const text = z.object({ id: z.number(), type: z.string() });
const file = z.object({ file_id: z.string(), duration: z.number().optional(), file_size: z.number().optional() });
export const updateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      message_id: z.number(),
      chat: text,
      from: z.object({ username: z.string().optional() }).optional(),
      text: z.string().optional(),
      voice: file.optional(),
      audio: file.optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      message: z.object({ message_id: z.number(), chat: text }).optional(),
    })
    .optional(),
});
export type TgUpdate = z.infer<typeof updateSchema>;

// What the person reads. Short, with emoji and large numbers, in Filipino with the English words the app uses.
// Telegram's HTML mode: only these three characters need escaping in what people say.
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const words = {
  notLinked: "Hindi pa naka-link ang Telegram mo. 🙏\nHingin sa admin ang link mo, tapos pindutin iyon.",
  linked: (name: string) =>
    `✅ Naka-link ka na, ${name.split(/\s+/)[0] || "kaibigan"}!\n\n🎤 Para humingi ng budget, mag-send ng <b>voice message</b>. Sabihin ang halaga at para saan.\n\nHalimbawa: "Kailangan ko ng dalawang libo para sa gasolina ng service."`,
  badLink: "Hindi gumana ang link na ito. Baka luma na o nagamit na. Hingi ng bago sa admin.",
  help: "🎤 Mag-send ng <b>voice message</b> para humingi ng budget.\nSabihin ang <b>halaga</b> at <b>para saan</b>.\n\nI-check ang buod na ibabalik ko, pagkatapos pindutin ang ✅ Submit.\n\nPara mag-cancel: /cancel",
  working: "⏳ Pinakikinggan ko ang voice message mo...",
  tooLong: "Masyadong mahaba ang voice message. Gawing mas maikli (hanggang 1 minuto) at ulitin.",
  tooBig: "Masyadong malaki ang file. Mag-send ng mas maikling voice message.",
  rate: "Sandali lang po, masyadong mabilis. Subukan ulit pagkatapos ng isang minuto.",
  couldNotRead: "Hindi ko naintindihan ang voice message. 😕\nSubukan ulit, o i-type ang halaga at dahilan (hal. 2500 pambili ng gasolina).",
  needAmount: "💰 Sabihin o i-type ang tamang <b>halaga</b> (numero lang), hal. 2500",
  needPurpose: "📌 Sabihin o i-type kung <b>para saan</b> ang budget.",
  badAmount: "Hindi ko makita ang halaga. Numero lang po, hal. 2500",
  noDraft: "Walang request na ginagawa. Mag-send ng 🎤 voice message para magsimula.",
  oldButton: "Luma na ang request na ito.",
  cancelled: "❌ Kinansela ang request.",
  alreadyDone: "Naipasa na ang request na ito.",
};

const fundName = (funds: FundChoice[], id: string | null) => funds.find((fund) => fund.id === id)?.name ?? null;

export function summary(draft: Draft, funds: FundChoice[]): string {
  const fund = fundName(funds, draft.fund_id);
  const lines = [
    "📝 <b>Budget request mo</b>",
    "",
    `💰 Halaga: ${draft.amount ? `<b>${formatPHP(draft.amount)}</b>` : "❓ <i>kulang pa</i>"}`,
    `📌 Para sa: ${draft.purpose ? esc(draft.purpose) : "❓ <i>kulang pa</i>"}`,
    `🏦 Fund: ${fund ? esc(fund) : "❓ <i>piliin</i>"}`,
    "",
    draft.amount && draft.purpose && fund ? "Tama ba? Pindutin ang ✅ Submit." : "Kumpletuhin muna ang may ❓.",
  ];
  return lines.join("\n");
}

export function summaryButtons(draft: Draft, funds: FundChoice[]): Markup {
  const rows: Button[][] = [];
  if (draft.amount && draft.purpose && draft.fund_id) rows.push([{ text: "✅ Submit", callback_data: `submit:${draft.id}` }]);
  rows.push([{ text: "💰 Palitan ang halaga", callback_data: `amt:${draft.id}` }]);
  rows.push([{ text: "📌 Palitan ang dahilan", callback_data: `pur:${draft.id}` }]);
  if (funds.length > 1) rows.push([{ text: "🏦 Palitan ang fund", callback_data: `fundmenu:${draft.id}` }]);
  rows.push([{ text: "❌ Kanselahin", callback_data: `cancel:${draft.id}` }]);
  return { inline_keyboard: rows };
}

function fundButtons(draft: Draft, funds: FundChoice[]): Markup {
  return {
    inline_keyboard: [
      ...funds.slice(0, 8).map((fund) => [{ text: fund.name.slice(0, 40), callback_data: `fund:${draft.id}:${fund.id.slice(0, 8)}` }]),
      [{ text: "⬅️ Bumalik", callback_data: `back:${draft.id}` }],
    ],
  };
}

// Show (or refresh) the summary in the message the person is already looking at.
async function showSummary(deps: Deps, draft: Draft, funds: FundChoice[], replaceMessage = true) {
  const body = summary(draft, funds);
  const markup = summaryButtons(draft, funds);
  if (replaceMessage && draft.message_id) {
    try {
      await deps.tg.edit(draft.chat_id, draft.message_id, body, markup);
      return;
    } catch {
      // fall through and send a fresh one
    }
  }
  const messageId = await deps.tg.send(draft.chat_id, body, markup);
  await deps.store.updateDraft(draft.id, { message_id: messageId });
}

// The fund of a new draft: the only one, or the one the speaker named.
function pickFund(funds: FundChoice[], named: string): string | null {
  if (funds.length === 1) return funds[0].id;
  return funds.some((fund) => fund.id === named) ? named : null;
}

async function startDraft(deps: Deps, person: Person, chatId: number, transcript: string, messageId: number | null) {
  const funds = await deps.store.funds();
  const spoken = await deps.voice.extract(transcript, funds);
  const draft = await deps.store.newDraft({
    chatId,
    profileId: person.id,
    fundId: pickFund(funds, spoken.fund_id),
    amount: spoken.amount ? Number(spoken.amount) : null,
    purpose: spoken.purpose || null,
    transcript,
    messageId,
  });
  await showSummary(deps, draft, funds);
}

async function applyEdit(deps: Deps, draft: Draft, said: string) {
  const funds = await deps.store.funds();
  if (draft.status === "editing_amount") {
    const amount = guessAmount(said);
    if (!amount) {
      await deps.tg.send(draft.chat_id, words.badAmount);
      return;
    }
    const next = await deps.store.updateDraft(draft.id, { amount: Number(amount), status: "draft" });
    await showSummary(deps, next, funds, false);
    return;
  }
  const purpose = cleanText(said).slice(0, 300);
  if (!purpose) {
    await deps.tg.send(draft.chat_id, words.needPurpose);
    return;
  }
  const next = await deps.store.updateDraft(draft.id, { purpose, status: "draft" });
  await showSummary(deps, next, funds, false);
}

async function handleVoice(deps: Deps, person: Person, chatId: number, voice: z.infer<typeof file>) {
  if (!(await deps.limit(`telegram:voice:${chatId}`, 10, 60))) return void (await deps.tg.send(chatId, words.rate));
  if ((voice.duration ?? 0) > 90) return void (await deps.tg.send(chatId, words.tooLong));
  if ((voice.file_size ?? 0) > 10 * 1024 * 1024) return void (await deps.tg.send(chatId, words.tooBig));
  const working = await deps.tg.send(chatId, words.working);
  let said: string;
  try {
    said = await deps.voice.transcribe(await deps.tg.voice(voice.file_id), "voice.ogg");
  } catch {
    return void (await deps.tg.edit(chatId, working, words.couldNotRead));
  }
  const open = await deps.store.openDraft(chatId);
  if (open && open.status !== "draft") {
    // a spoken correction to the amount or the reason: show what was heard, then apply it
    await deps.tg.edit(chatId, working, `👂 “${esc(said.slice(0, 200))}”`);
    await applyEdit(deps, open, said);
    return;
  }
  await startDraft(deps, person, chatId, said, working);
}

async function handleText(deps: Deps, person: Person, chatId: number, said: string) {
  const open = await deps.store.openDraft(chatId);
  if (open && open.status !== "draft") return void (await applyEdit(deps, open, said));
  // typed words start a request only when they carry an amount; "salamat" must not start one
  if (!guessAmount(said)) return void (await deps.tg.send(chatId, words.help));
  if (!(await deps.limit(`telegram:text:${chatId}`, 10, 60))) return void (await deps.tg.send(chatId, words.rate));
  await startDraft(deps, person, chatId, cleanText(said).slice(0, 2000), null);
}

async function submit(deps: Deps, person: Person, draft: Draft, funds: FundChoice[]) {
  if (!draft.amount) {
    await deps.store.updateDraft(draft.id, { status: "editing_amount" });
    return void (await deps.tg.send(draft.chat_id, words.needAmount));
  }
  if (!draft.purpose) {
    await deps.store.updateDraft(draft.id, { status: "editing_purpose" });
    return void (await deps.tg.send(draft.chat_id, words.needPurpose));
  }
  if (!draft.fund_id || !funds.some((fund) => fund.id === draft.fund_id)) {
    if (draft.message_id) await deps.tg.edit(draft.chat_id, draft.message_id, "🏦 Anong fund?", fundButtons(draft, funds));
    return;
  }
  const checked = createBudgetRequestSchema.safeParse({ fund_id: draft.fund_id, requester_name: person.name, amount: draft.amount.toFixed(2), purpose: draft.purpose });
  if (!checked.success) return void (await deps.tg.send(draft.chat_id, `⚠️ ${esc(checked.error.issues[0]?.message ?? "Check the request.")}`));
  if (!(await deps.limit(`telegram:submit:${draft.chat_id}`, 5, 60))) return void (await deps.tg.send(draft.chat_id, words.rate));
  if (await deps.repeat(person.id, checked.data)) return void (await deps.tg.send(draft.chat_id, words.alreadyDone));
  // Only one tap wins; a second one (or a retry) finds the request already being made.
  if (!(await deps.store.claimSubmit(draft.id))) return void (await deps.tg.send(draft.chat_id, words.alreadyDone));
  try {
    const made = await deps.store.createRequest(person.id, draft.fund_id, draft.amount, draft.purpose);
    await deps.store.finishDraft(draft.id, made.id);
    const done = [
      "✅ <b>Naipasa na ang request mo!</b>",
      "",
      `Ref: ${made.ref}`,
      `💰 ${formatPHP(draft.amount)}`,
      `📌 ${esc(draft.purpose)}`,
      `🏦 ${esc(fundName(funds, draft.fund_id) ?? "")}`,
      "",
      "Aabisuhan kita rito kapag may sagot na.",
    ].join("\n");
    if (draft.message_id) await deps.tg.edit(draft.chat_id, draft.message_id, done);
    else await deps.tg.send(draft.chat_id, done);
    deps.afterRequest(made.id, person.id);
  } catch (error) {
    // the rules said no (for example, over the fund's limit): keep the draft so it can be corrected
    await deps.store.releaseSubmit(draft.id);
    const reason = error instanceof Error ? error.message : "Hindi naipasa. Subukan ulit.";
    await deps.tg.send(draft.chat_id, `⚠️ ${esc(reason)}\n\nPwede mong palitan ang halaga o dahilan, tapos Submit ulit.`);
  }
}

async function handleCallback(deps: Deps, person: Person, query: NonNullable<TgUpdate["callback_query"]>) {
  const chatId = query.message?.chat.id;
  const [action, draftId, extra] = (query.data ?? "").split(":");
  if (!chatId || !action || !draftId) return void (await deps.tg.answer(query.id));
  const draft = await deps.store.openDraft(chatId);
  if (!draft || draft.id !== draftId) {
    await deps.tg.answer(query.id, words.oldButton);
    if (query.message) await deps.tg.edit(chatId, query.message.message_id, words.oldButton).catch(() => undefined);
    return;
  }
  await deps.tg.answer(query.id);
  const funds = await deps.store.funds();
  switch (action) {
    case "submit":
      return submit(deps, person, draft, funds);
    case "cancel":
      await deps.store.cancelDraft(draft.id);
      if (draft.message_id) await deps.tg.edit(chatId, draft.message_id, words.cancelled);
      else await deps.tg.send(chatId, words.cancelled);
      return;
    case "amt":
      await deps.store.updateDraft(draft.id, { status: "editing_amount" });
      return void (await deps.tg.send(chatId, words.needAmount));
    case "pur":
      await deps.store.updateDraft(draft.id, { status: "editing_purpose" });
      return void (await deps.tg.send(chatId, words.needPurpose));
    case "fundmenu":
      if (draft.message_id) await deps.tg.edit(chatId, draft.message_id, "🏦 Anong fund?", fundButtons(draft, funds));
      return;
    case "fund": {
      const chosen = funds.find((fund) => fund.id.startsWith(extra ?? "\u0000"));
      if (!chosen) return;
      const next = await deps.store.updateDraft(draft.id, { fund_id: chosen.id, status: "draft" });
      return showSummary(deps, next, funds);
    }
    case "back":
      return showSummary(deps, draft, funds);
  }
}

export async function handleUpdate(update: TgUpdate, deps: Deps): Promise<void> {
  // Telegram resends an update until it is answered; each one counts once.
  if (!(await deps.store.firstSeen(update.update_id))) return;

  const message = update.message;
  if (message) {
    const chatId = message.chat.id;
    // only a private conversation with the person; never a group
    if (message.chat.type !== "private") return;
    const said = message.text?.trim();

    const start = said ? /^\/start(?:@\w+)?(?:\s+(\S+))?/.exec(said) : null;
    if (start) {
      if (start[1]) {
        try {
          const person = await deps.store.redeem(start[1], chatId, message.from?.username ?? null);
          await deps.tg.send(chatId, words.linked(person.name));
        } catch {
          await deps.tg.send(chatId, words.badLink);
        }
        return;
      }
      return void (await deps.tg.send(chatId, (await deps.store.profileOf(chatId)) ? words.help : words.notLinked));
    }

    const person = await deps.store.profileOf(chatId);
    if (!person) return void (await deps.tg.send(chatId, words.notLinked));

    if (said && /^\/cancel(?:@\w+)?$/.test(said)) {
      const open = await deps.store.openDraft(chatId);
      if (!open) return void (await deps.tg.send(chatId, words.noDraft));
      await deps.store.cancelDraft(open.id);
      return void (await deps.tg.send(chatId, words.cancelled));
    }
    if (said && /^\/(help|start)(?:@\w+)?$/.test(said)) return void (await deps.tg.send(chatId, words.help));

    const voice = message.voice ?? message.audio;
    if (voice) return handleVoice(deps, person, chatId, voice);
    if (said) return handleText(deps, person, chatId, said);
    return;
  }

  const query = update.callback_query;
  if (query) {
    const chatId = query.message?.chat.id;
    if (!chatId || query.message?.chat.type !== "private") return void (await deps.tg.answer(query.id));
    const person = await deps.store.profileOf(chatId);
    if (!person) return void (await deps.tg.answer(query.id, words.notLinked));
    await handleCallback(deps, person, query);
  }
}
