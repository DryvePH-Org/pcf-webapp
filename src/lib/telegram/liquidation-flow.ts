import { formatPHP } from "@/lib/money";
import { cleanText } from "@/lib/validators/text";
import { guessAmount } from "@/lib/voice/extract-request";

import type { Deps, Markup, Person, TgMessage } from "./flow";

// Filing a liquidation in the chat: a photo of each receipt, a few words about it, a look at the total, Submit.
// It becomes the person's ordinary liquidation (same functions and checks as the website), and the custodian
// reviews it as usual. Everything outside (database, picture storage, receipt reading) comes in through LiqDeps.

export type LiqStatus = "choosing" | "draft" | "editing_particulars" | "editing_amount" | "editing_department" | "adding_photo" | "splitting";
export type LiqDraft = {
  id: string;
  chat_id: number;
  profile_id: string;
  voucher_id: string | null;
  liquidation_id: string | null;
  department: string;
  status: LiqStatus;
  edit_line: string | null;
  message_id: number | null;
  pending_file: string | null;
  pending_caption: string | null;
};
export type LiqDraftPatch = Partial<{ department: string; status: LiqStatus; edit_line: string | null; message_id: number | null }>;
export type LiqLine = { id: string; particulars: string; amount: number | null; receipt_path: string | null; read_amount: number | null; reading: boolean; extra_photos: string[] };
// An advance the person still has to liquidate.
export type Outstanding = {
  voucher_id: string;
  pcv_number: string;
  fund_name: string;
  amount: number;
  overdue: boolean;
  // the custodian sent it back, or the person already started it on the website: finish it there
  elsewhere: boolean;
};

export type LiqDeps = {
  store: {
    outstanding(profileId: string): Promise<Outstanding[]>;
    openDraft(chatId: number): Promise<LiqDraft | null>;
    // starts a draft; with a voucher it also opens (or finds) that advance's liquidation
    begin(input: { chatId: number; profileId: string; voucherId: string | null; pendingFile: string | null; pendingCaption: string | null }): Promise<LiqDraft>;
    choose(draft: LiqDraft, profileId: string, voucherId: string): Promise<LiqDraft>;
    updateDraft(id: string, patch: LiqDraftPatch): Promise<LiqDraft>;
    lines(draftId: string): Promise<LiqLine[]>;
    addLine(input: { draftId: string; id: string; particulars: string; amount: number | null; receiptPath: string; reading: boolean }): Promise<LiqLine>;
    updateLine(id: string, patch: Partial<{ particulars: string; amount: number | null }>): Promise<void>;
    removeLine(id: string): Promise<void>;
    // another picture of the same receipt line
    addPhoto(lineId: string, path: string): Promise<void>;
    // the line becomes these parts: the first keeps the line's id and extra pictures, the others have their own id and picture copy
    splitLine(lineId: string, parts: { id: string; particulars: string; amount: number; receiptPath: string }[]): Promise<void>;
    // what reading the picture suggested; fills the amount only if nobody typed one meanwhile
    setRead(id: string, amount: number | null): Promise<void>;
    claimSubmit(id: string): Promise<boolean>;
    releaseSubmit(id: string): Promise<void>;
    // saves the lines and submits the liquidation, as the person
    submit(draft: LiqDraft, lines: LiqLine[]): Promise<void>;
    cancel(id: string): Promise<void>;
  };
  files: {
    photo(fileId: string): Promise<Blob>;
    // keeps the picture with the liquidation; returns where
    upload(liquidationId: string, lineId: string, picture: Blob): Promise<string>;
    // a copy of a picture in another line's own folder (the database wants each line's picture in its own folder)
    copy(liquidationId: string, fromPath: string, lineId: string): Promise<string>;
    // the amount printed on the receipt, "" when it cannot be read
    read(picture: Blob): Promise<string>;
  };
};

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cents = (value: number) => Math.round(value * 100);

export const liqWords = {
  none: "Wala kang advance na kailangang i-liquidate ngayon. 👍",
  elsewhere: "May advance kang nasimulan na sa website o ibinalik ng custodian. Doon mo ito tapusin: pcf.dryveph.io",
  pick: "🧾 <b>Alin ang ili-liquidate mo?</b>",
  first: "📸 Mag-send ng <b>larawan ng unang resibo</b>.\nPwede mong lagyan ng caption na ganito: <i>gasolina 450</i> (paliwanag, tapos halaga).",
  working: "⏳ Sine-save ang resibo...",
  reading: "⏳ Binabasa ang resibo...",
  needParticulars: "📌 <b>Para saan</b> ang resibong ito? I-type o i-voice. Hal. <i>gasolina ng service</i>",
  needAmount: "💰 Ilang <b>piso</b> ang nasa resibo? Numero lang, hal. 450",
  needDepartment: "🏢 Anong <b>department</b> mo? Isang beses lang ito itatanong.",
  badAmount: "Hindi ko makita ang halaga. Numero lang po, hal. 450",
  tooMany: "Hanggang 20 resibo lang sa isang liquidation. Pindutin ang ✅ Submit, tapos gumawa ng bago para sa iba.",
  tooManyPhotos: "Hanggang 5 pang larawan lang sa isang resibo.",
  addPhoto: "📸 Mag-send ng <b>dagdag na larawan</b> ng resibong ito (halimbawa ang kabilang bahagi).",
  photoAdded: "✅ Naidagdag ang larawan.",
  needFirst: "Mag-send muna ng larawan ng resibo, saka mo lagyan ng dagdag na larawan.",
  split: (total: number | null) => `✂️ Isulat ang <b>bawat bahagi</b> ng resibo, isang linya bawat isa, na may halaga sa dulo:\n<i>bolt 120\nhose 300</i>${total ? `\n\nDapat umabot sa <b>${formatPHP(total)}</b> ang kabuuan.` : ""}`,
  splitFew: "Kailangan ng hindi bababa sa 2 bahagi, isa-isang linya (may halaga sa dulo).",
  splitNoAmount: (part: string) => `Walang halaga ang "${part}". Ilagay ang halaga sa dulo, hal. ${part} 120`,
  splitOff: (sum: number, total: number) => `Ang kabuuan ng mga bahagi ay ${formatPHP(sum)}, pero ${formatPHP(total)} ang resibo. Ayusin at i-send ulit.`,
  waitPhoto: "📸 Larawan ang hinihintay ko. Mag-send ng larawan, o /cancel para ihinto ang liquidation.",
  asFile: "I-send ang resibo bilang <b>larawan</b> (photo), hindi bilang file.",
  noPhoto: "Hindi ko ma-download ang larawan. Subukan ulit.",
  sendPhoto: "📸 Mag-send ng larawan ng resibo para magdagdag.",
  choosing: "Pumili muna ng voucher sa itaas, saka ako magpapatuloy.",
  done: "Naipasa na ang liquidation na ito.",
  cancelled: "❌ Kinansela ang liquidation. Walang nabago sa advance mo.",
  oldButton: "Luma na ang liquidation na ito.",
  rate: "Sandali lang po, masyadong mabilis. Subukan ulit pagkatapos ng isang minuto.",
  noDraft: "Walang liquidation na ginagawa.",
};

// "gasolina 450", "pamasahe ₱1,250.50", "450 gasolina": the amount only when it is the first or the last word, so a
// plate or a quantity in the middle is never taken for money. The card shows it for the person to check.
export function splitCaption(raw: string): { particulars: string; amount: number | null } {
  const said = cleanText(raw).trim();
  const money = String.raw`(?:₱|php\.?\s*|p\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?:\s*(?:pesos|piso|php))?`;
  const toAmount = (whole: string, frac?: string) => {
    const value = guessAmount(`${whole}${frac ? "." + frac : ""}`);
    return value ? Number(value) : null;
  };
  // a plate number (ABC 1234) is not money, unless a peso sign or "php" says so
  if (/\b[A-Z]{3}[\s-]?\d{3,4}\b/.test(said) && !/₱|php|\bp\s*\d|pesos|piso/i.test(said)) return { particulars: said.slice(0, 300), amount: null };
  const last = new RegExp(String.raw`^(.*\S)[\s:=-]+${money}$`, "i").exec(said);
  if (last) {
    const amount = toAmount(last[2], last[3]);
    if (amount) return { particulars: last[1].trim().slice(0, 300), amount };
  }
  // up front, only with a peso sign ("₱300 pagkain"): a bare "2 gulong" is a quantity
  const first = new RegExp(String.raw`^(?:₱|php\.?\s*)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?[\s:=-]+(.*\S)$`, "i").exec(said);
  if (first) {
    const amount = toAmount(first[1], first[2]);
    if (amount) return { particulars: first[3].trim().slice(0, 300), amount };
  }
  return { particulars: said.slice(0, 300), amount: null };
}

// One receipt, several particulars: one per line (or separated by ;), the amount last on each.
export function parseParts(raw: string, expected: number | null): { parts: { particulars: string; amount: number }[] } | { error: string } {
  const segments = raw.split(/[\n;]+/).map((part) => part.trim()).filter(Boolean);
  const parts: { particulars: string; amount: number }[] = [];
  for (const segment of segments) {
    const said = splitCaption(segment);
    if (!said.particulars || !said.amount) return { error: liqWords.splitNoAmount(cleanText(segment).slice(0, 60)) };
    parts.push({ particulars: said.particulars, amount: said.amount });
  }
  if (parts.length < 2) return { error: liqWords.splitFew };
  if (parts.length > 20) return { error: liqWords.tooMany };
  const sum = parts.reduce((total, part) => total + cents(part.amount), 0);
  if (expected && sum !== cents(expected)) return { error: liqWords.splitOff(sum / 100, expected) };
  return { parts };
}

// The largest picture Telegram offers that is still receipt-sized.
export function pickPhoto(sizes: { file_id: string; width: number; height: number; file_size?: number }[]) {
  const fits = sizes.filter((size) => Math.max(size.width, size.height) <= 1600);
  const pool = fits.length ? fits : [...sizes].sort((a, b) => a.width * a.height - b.width * b.height).slice(0, 1);
  return [...pool].sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}

const complete = (line: LiqLine) => Boolean(line.particulars && line.amount && line.receipt_path);

export function liqCard(draft: LiqDraft, lines: LiqLine[], context: { pcv: string; fund: string; received: number } | null): { text: string; markup: Markup } {
  const total = lines.reduce((sum, line) => sum + cents(line.amount ?? 0), 0);
  const received = context ? cents(context.received) : null;
  const rows = lines.map((line, index) => {
    const warn = line.read_amount && line.amount && cents(line.read_amount) !== cents(line.amount) ? ` ⚠️ <i>nabasa sa resibo: ${formatPHP(line.read_amount)}</i>` : "";
    const reading = line.reading ? " ⏳" : "";
    const more = line.extra_photos.length ? ` 📎+${line.extra_photos.length}` : "";
    return `${index + 1}. ${line.particulars ? esc(line.particulars) : "❓ <i>kulang ang paliwanag</i>"} — ${line.amount ? `<b>${formatPHP(line.amount)}</b>` : "❓ <i>kulang ang halaga</i>"}${reading}${more}${warn}`;
  });
  const text = [
    "🧾 <b>Liquidation mo</b>",
    ...(context ? [`🏦 ${esc(context.fund)} · ${esc(context.pcv)}`, `💵 Natanggap mo: <b>${formatPHP(context.received)}</b>`] : []),
    "",
    ...(rows.length ? rows : ["<i>Wala pang resibo.</i>"]),
    ...(rows.length ? ["", `Kabuuang gastos: <b>${formatPHP(total / 100)}</b>`] : []),
    ...(received !== null && rows.length
      ? [total <= received ? `↩️ Isasauli sa custodian: <b>${formatPHP((received - total) / 100)}</b>` : `💳 Ire-reimburse sa iyo: <b>${formatPHP((total - received) / 100)}</b>`]
      : []),
    `🏢 Department: ${draft.department ? esc(draft.department) : "❓ <i>kulang pa</i>"}`,
    "",
    lines.length && lines.every(complete) && draft.department ? "Tama ba? Pindutin ang ✅ Submit. Magdagdag pa ng resibo kung kulang." : "📸 Mag-send ng larawan ng resibo para magdagdag, at kumpletuhin ang may ❓.",
  ].join("\n");
  const buttons: Markup["inline_keyboard"] = [];
  const key = draft.id.slice(0, 8);
  if (lines.length && lines.every(complete) && draft.department) buttons.push([{ text: "✅ Submit", callback_data: `lq:submit:${key}` }]);
  if (lines.length) buttons.push([{ text: "✏️ Ayusin ang linya", callback_data: `lq:lines:${key}` }]);
  buttons.push([{ text: "🏢 Palitan ang department", callback_data: `lq:dept:${key}` }]);
  buttons.push([{ text: "❌ Kanselahin", callback_data: `lq:cancel:${key}` }]);
  return { text, markup: { inline_keyboard: buttons } };
}

async function context(deps: Deps, draft: LiqDraft, person: Person) {
  if (!draft.voucher_id) return null;
  const mine = await deps.liq.store.outstanding(person.id);
  const found = mine.find((row) => row.voucher_id === draft.voucher_id);
  return found ? { pcv: found.pcv_number, fund: found.fund_name, received: found.amount } : null;
}

// Show (or refresh) the card. A new photo gets a fresh card at the bottom of the chat; edits change it in place.
async function showCard(deps: Deps, person: Person, draft: LiqDraft, fresh = false) {
  const [lines, info] = await Promise.all([deps.liq.store.lines(draft.id), context(deps, draft, person)]);
  const { text, markup } = liqCard(draft, lines, info);
  if (!fresh && draft.message_id) {
    try {
      await deps.tg.edit(draft.chat_id, draft.message_id, text, markup);
      return;
    } catch {
      // fall through and send a fresh one
    }
  }
  const messageId = await deps.tg.send(draft.chat_id, text, markup);
  await deps.liq.store.updateDraft(draft.id, { message_id: messageId });
}

function voucherButtons(list: Outstanding[], draft: LiqDraft): Markup {
  return {
    inline_keyboard: [
      ...list.filter((row) => !row.elsewhere).slice(0, 8).map((row) => [{ text: `${row.overdue ? "⏰ " : ""}${row.pcv_number} · ${formatPHP(row.amount)} · ${row.fund_name.slice(0, 24)}`, callback_data: `lq:pick:${draft.id.slice(0, 8)}:${row.voucher_id.slice(0, 8)}` }]),
      [{ text: "❌ Kanselahin", callback_data: `lq:cancel:${draft.id.slice(0, 8)}` }],
    ],
  };
}

async function showPicker(deps: Deps, draft: LiqDraft, list: Outstanding[]) {
  const body = [liqWords.pick, "", ...list.filter((row) => !row.elsewhere).slice(0, 8).map((row) => `• <b>${esc(row.pcv_number)}</b> — ${formatPHP(row.amount)} (${esc(row.fund_name)})${row.overdue ? " ⏰ <i>lampas na sa oras</i>" : ""}`)].join("\n");
  const markup = voucherButtons(list, draft);
  if (draft.message_id) {
    try {
      await deps.tg.edit(draft.chat_id, draft.message_id, body, markup);
      return;
    } catch {
      // send a fresh one
    }
  }
  const messageId = await deps.tg.send(draft.chat_id, body, markup);
  await deps.liq.store.updateDraft(draft.id, { message_id: messageId });
}

// Opens the draft for a chat: the only advance goes straight in, several ask which one.
async function open(deps: Deps, person: Person, chatId: number, pending: { file: string; caption: string } | null): Promise<LiqDraft | null> {
  const list = await deps.liq.store.outstanding(person.id);
  const usable = list.filter((row) => !row.elsewhere);
  if (!usable.length) {
    await deps.tg.send(chatId, list.length ? liqWords.elsewhere : liqWords.none);
    return null;
  }
  const base = { chatId, profileId: person.id, pendingFile: pending?.file ?? null, pendingCaption: pending?.caption ?? null };
  if (usable.length === 1) {
    const draft = await deps.liq.store.begin({ ...base, voucherId: usable[0].voucher_id });
    return draft;
  }
  const draft = await deps.liq.store.begin({ ...base, voucherId: null });
  await showPicker(deps, draft, list);
  return null;
}

function failure(error: unknown) {
  return `⚠️ ${esc(error instanceof Error ? error.message : "Hindi nagawa. Subukan ulit.")}`;
}

// The reading of a receipt picture runs after the card is shown, so the person never waits for it.
async function readReceipt(deps: Deps, person: Person, chatId: number, draftId: string, lineId: string, picture: Blob) {
  let amount = 0;
  try {
    amount = Number(await deps.liq.files.read(picture)) || 0;
  } catch {
    amount = 0;
  }
  await deps.liq.store.setRead(lineId, amount > 0 ? amount : null);
  const draft = await deps.liq.store.openDraft(chatId);
  if (!draft || draft.id !== draftId) return;
  const lines = await deps.liq.store.lines(draft.id);
  const line = lines.find((item) => item.id === lineId);
  let next = draft;
  // nothing found and no amount typed: ask for it, unless the person is busy with something else
  if (line && !line.amount && line.particulars && draft.status === "draft") {
    next = await deps.liq.store.updateDraft(draft.id, { status: "editing_amount", edit_line: line.id });
    await showCard(deps, person, next);
    await deps.tg.send(draft.chat_id, liqWords.needAmount);
    return;
  }
  // the amount arrived while they were being asked for it
  if (line?.amount && draft.status === "editing_amount" && draft.edit_line === line.id) next = await deps.liq.store.updateDraft(draft.id, { status: "draft", edit_line: null });
  await showCard(deps, person, next);
}

async function addReceipt(deps: Deps, person: Person, draft: LiqDraft, fileId: string, caption: string) {
  if (!draft.liquidation_id) return;
  const before = await deps.liq.store.lines(draft.id);
  if (before.length >= 20) return void (await deps.tg.send(draft.chat_id, liqWords.tooMany));
  const lineId = globalThis.crypto.randomUUID();
  const picture = await deps.liq.files.photo(fileId).catch(() => null);
  if (!picture) return void (await deps.tg.send(draft.chat_id, liqWords.noPhoto));
  let path: string;
  try {
    path = await deps.liq.files.upload(draft.liquidation_id, lineId, picture);
  } catch (error) {
    return void (await deps.tg.send(draft.chat_id, failure(error)));
  }
  const said = splitCaption(caption);
  const line = await deps.liq.store.addLine({ draftId: draft.id, id: lineId, particulars: said.particulars, amount: said.amount, receiptPath: path, reading: said.amount === null });
  // ask for what is missing about this receipt; the newest picture is the one being talked about
  let next = draft;
  if (!said.particulars) next = await deps.liq.store.updateDraft(draft.id, { status: "editing_particulars", edit_line: line.id });
  else if (said.amount !== null && draft.status !== "draft") next = await deps.liq.store.updateDraft(draft.id, { status: "draft", edit_line: null });
  await showCard(deps, person, next, true);
  if (!said.particulars) await deps.tg.send(draft.chat_id, liqWords.needParticulars);
  if (said.amount === null) await readReceipt(deps, person, draft.chat_id, draft.id, line.id, picture);
}

export async function handlePhoto(deps: Deps, person: Person, message: TgMessage) {
  const chatId = message.chat.id;
  if (message.document) return void (await deps.tg.send(chatId, liqWords.asFile));
  const photo = pickPhoto(message.photo ?? []);
  if (!photo) return;
  if (!(await deps.limit(`telegram:photo:${chatId}`, 12, 60))) return void (await deps.tg.send(chatId, liqWords.rate));
  const caption = message.caption ?? "";
  let draft = await deps.liq.store.openDraft(chatId);
  // another picture of a receipt already in the list: "+" as the caption, or after tapping Dagdag na larawan
  if (draft?.liquidation_id && draft.status !== "choosing") {
    const lines = await deps.liq.store.lines(draft.id);
    const target = draft.status === "adding_photo" ? lines.find((line) => line.id === draft!.edit_line) : caption.trim() === "+" ? lines.at(-1) : undefined;
    if (target) return attachPhoto(deps, person, draft, target, photo.file_id);
    if (caption.trim() === "+") return void (await deps.tg.send(chatId, liqWords.needFirst));
  } else if (caption.trim() === "+") return void (await deps.tg.send(chatId, liqWords.needFirst));
  if (!draft) {
    try {
      draft = await open(deps, person, chatId, { file: photo.file_id, caption });
    } catch (error) {
      return void (await deps.tg.send(chatId, failure(error)));
    }
    if (!draft) return;
    // the only advance: the first photo is added at once
    return startWithPhoto(deps, person, draft, photo.file_id, caption);
  }
  if (draft.status === "choosing") return void (await deps.tg.send(chatId, liqWords.choosing));
  // a new receipt ends a half-done "add a picture" or "split"
  if (draft.status === "adding_photo" || draft.status === "splitting") draft = await deps.liq.store.updateDraft(draft.id, { status: "draft", edit_line: null });
  await addReceipt(deps, person, draft, photo.file_id, caption);
}

async function attachPhoto(deps: Deps, person: Person, draft: LiqDraft, line: LiqLine, fileId: string) {
  if (!draft.liquidation_id) return;
  const settle = () => (draft.status === "adding_photo" ? deps.liq.store.updateDraft(draft.id, { status: "draft", edit_line: null }) : Promise.resolve(draft));
  if (line.extra_photos.length >= 5) {
    await showCard(deps, person, await settle());
    return void (await deps.tg.send(draft.chat_id, liqWords.tooManyPhotos));
  }
  const picture = await deps.liq.files.photo(fileId).catch(() => null);
  if (!picture) return void (await deps.tg.send(draft.chat_id, liqWords.noPhoto));
  try {
    // the picture sits in the line's own folder, as the database requires
    await deps.liq.store.addPhoto(line.id, await deps.liq.files.upload(draft.liquidation_id, line.id, picture));
  } catch (error) {
    return void (await deps.tg.send(draft.chat_id, failure(error)));
  }
  await showCard(deps, person, await settle());
}

async function startWithPhoto(deps: Deps, person: Person, draft: LiqDraft, fileId: string, caption: string) {
  const first = draft.pending_file ?? fileId;
  await addReceipt(deps, person, draft, first, draft.pending_file ? (draft.pending_caption ?? "") : caption);
}

// /liquidate
export async function handleStart(deps: Deps, person: Person, chatId: number) {
  const existing = await deps.liq.store.openDraft(chatId);
  if (existing) {
    if (existing.status === "choosing") {
      const list = await deps.liq.store.outstanding(person.id);
      return void (await showPicker(deps, existing, list));
    }
    return showCard(deps, person, existing, true);
  }
  let draft: LiqDraft | null;
  try {
    draft = await open(deps, person, chatId, null);
  } catch (error) {
    return void (await deps.tg.send(chatId, failure(error)));
  }
  if (!draft) return;
  await showCard(deps, person, draft, true);
  await deps.tg.send(chatId, liqWords.first);
}

async function applyEdit(deps: Deps, person: Person, draft: LiqDraft, said: string) {
  const lines = await deps.liq.store.lines(draft.id);
  const line = lines.find((item) => item.id === draft.edit_line);
  if (draft.status === "adding_photo") return void (await deps.tg.send(draft.chat_id, liqWords.waitPhoto));
  if (draft.status === "splitting" && line) {
    const parsed = parseParts(said, line.amount ?? line.read_amount);
    if ("error" in parsed) return void (await deps.tg.send(draft.chat_id, `⚠️ ${esc(parsed.error)}`));
    if (!draft.liquidation_id || !line.receipt_path) return;
    const parts = [{ ...parsed.parts[0], id: line.id, receiptPath: line.receipt_path }];
    try {
      // every part needs its own copy of the picture, in its own folder
      for (const part of parsed.parts.slice(1)) {
        const id = globalThis.crypto.randomUUID();
        parts.push({ ...part, id, receiptPath: await deps.liq.files.copy(draft.liquidation_id, line.receipt_path, id) });
      }
      await deps.liq.store.splitLine(line.id, parts);
    } catch (error) {
      return void (await deps.tg.send(draft.chat_id, failure(error)));
    }
    return showCard(deps, person, await deps.liq.store.updateDraft(draft.id, { status: "draft", edit_line: null }));
  }
  if (draft.status === "editing_department") {
    const department = cleanText(said).slice(0, 100);
    if (!department) return void (await deps.tg.send(draft.chat_id, liqWords.needDepartment));
    const next = await deps.liq.store.updateDraft(draft.id, { department, status: "draft", edit_line: null });
    return showCard(deps, person, next);
  }
  if (!line) {
    const next = await deps.liq.store.updateDraft(draft.id, { status: "draft", edit_line: null });
    return showCard(deps, person, next);
  }
  if (draft.status === "editing_amount") {
    const amount = guessAmount(said);
    if (!amount) return void (await deps.tg.send(draft.chat_id, liqWords.badAmount));
    await deps.liq.store.updateLine(line.id, { amount: Number(amount) });
    const next = await deps.liq.store.updateDraft(draft.id, { status: "draft", edit_line: null });
    return showCard(deps, person, next);
  }
  // editing_particulars: a trailing amount counts only when the line has none yet
  const split = splitCaption(said);
  const particulars = (line.amount ? cleanText(said).slice(0, 300) : split.particulars) || "";
  if (!particulars) return void (await deps.tg.send(draft.chat_id, liqWords.needParticulars));
  const amount = !line.amount ? split.amount : null;
  await deps.liq.store.updateLine(line.id, { particulars, ...(amount ? { amount } : {}) });
  const stillNoAmount = !line.amount && !amount;
  if (stillNoAmount && !line.reading) {
    const next = await deps.liq.store.updateDraft(draft.id, { status: "editing_amount", edit_line: line.id });
    await showCard(deps, person, next);
    return void (await deps.tg.send(draft.chat_id, liqWords.needAmount));
  }
  const next = await deps.liq.store.updateDraft(draft.id, { status: "draft", edit_line: null });
  await showCard(deps, person, next);
}

// Words (typed, or a voice message that was turned into text) while the bot is waiting for an answer.
export async function handleSpoken(deps: Deps, person: Person, draft: LiqDraft, said: string) {
  return applyEdit(deps, person, draft, said);
}

async function lineMenu(deps: Deps, draft: LiqDraft) {
  const lines = await deps.liq.store.lines(draft.id);
  const key = draft.id.slice(0, 8);
  const body = ["✏️ <b>Alin ang aayusin?</b>", "", ...lines.map((line, index) => `${index + 1}. ${line.particulars ? esc(line.particulars) : "❓"} — ${line.amount ? formatPHP(line.amount) : "❓"}`)].join("\n");
  const markup: Markup = {
    inline_keyboard: [...lines.map((line, index) => [{ text: `${index + 1}. ${(line.particulars || "❓").slice(0, 24)} · ${line.amount ? formatPHP(line.amount) : "❓"}`, callback_data: `lq:line:${key}:${line.id.slice(0, 8)}` }]), [{ text: "⬅️ Bumalik", callback_data: `lq:back:${key}` }]],
  };
  if (draft.message_id) await deps.tg.edit(draft.chat_id, draft.message_id, body, markup);
  else await deps.tg.send(draft.chat_id, body, markup);
}

async function submit(deps: Deps, person: Person, draft: LiqDraft) {
  const lines = await deps.liq.store.lines(draft.id);
  if (!lines.length || !lines.every(complete)) return void (await showCard(deps, person, draft));
  if (!draft.department) {
    const next = await deps.liq.store.updateDraft(draft.id, { status: "editing_department", edit_line: null });
    await showCard(deps, person, next);
    return void (await deps.tg.send(draft.chat_id, liqWords.needDepartment));
  }
  if (!(await deps.limit(`telegram:liqsubmit:${draft.chat_id}`, 5, 60))) return void (await deps.tg.send(draft.chat_id, liqWords.rate));
  // only one tap wins; a second one finds it already being filed
  if (!(await deps.liq.store.claimSubmit(draft.id))) return void (await deps.tg.send(draft.chat_id, liqWords.done));
  const info = await context(deps, draft, person);
  try {
    await deps.liq.store.submit(draft, lines);
  } catch (error) {
    await deps.liq.store.releaseSubmit(draft.id);
    return void (await deps.tg.send(draft.chat_id, `${failure(error)}\n\nPwede mong ayusin ang mga linya, tapos Submit ulit.`));
  }
  const total = lines.reduce((sum, line) => sum + cents(line.amount ?? 0), 0);
  const received = info ? cents(info.received) : null;
  const done = [
    "✅ <b>Naipasa na ang liquidation mo!</b>",
    ...(info ? ["", `🏦 ${esc(info.fund)} · ${esc(info.pcv)}`] : []),
    `🧾 ${lines.length} resibo · <b>${formatPHP(total / 100)}</b>`,
    ...(received !== null ? [total <= received ? `↩️ Isauli sa custodian: ${formatPHP((received - total) / 100)}` : `💳 Reimbursement para sa iyo: ${formatPHP((total - received) / 100)} (pagkatapos ma-approve)`] : []),
    "",
    "Susuriin ito ng custodian. Aabisuhan kita rito kapag may sagot na.",
  ].join("\n");
  if (draft.message_id) await deps.tg.edit(draft.chat_id, draft.message_id, done).catch(() => undefined);
  else await deps.tg.send(draft.chat_id, done);
  if (draft.liquidation_id) deps.afterLiquidation(draft.liquidation_id, person.id);
}

export async function handleLiqCallback(deps: Deps, person: Person, query: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } }) {
  const chatId = query.message?.chat.id;
  const [, action, key, extra] = (query.data ?? "").split(":");
  if (!chatId || !action || !key) return void (await deps.tg.answer(query.id));
  const draft = await deps.liq.store.openDraft(chatId);
  if (!draft || !draft.id.startsWith(key)) {
    await deps.tg.answer(query.id, liqWords.oldButton);
    if (query.message) await deps.tg.edit(chatId, query.message.message_id, liqWords.oldButton).catch(() => undefined);
    return;
  }
  await deps.tg.answer(query.id);
  switch (action) {
    case "cancel":
      await deps.liq.store.cancel(draft.id);
      if (draft.message_id) await deps.tg.edit(chatId, draft.message_id, liqWords.cancelled).catch(() => undefined);
      else await deps.tg.send(chatId, liqWords.cancelled);
      return;
    case "pick": {
      if (draft.status !== "choosing") return;
      const list = await deps.liq.store.outstanding(person.id);
      const chosen = list.find((row) => !row.elsewhere && row.voucher_id.startsWith(extra ?? "\u0000"));
      if (!chosen) return;
      let started: LiqDraft;
      try {
        started = await deps.liq.store.choose(draft, person.id, chosen.voucher_id);
      } catch (error) {
        return void (await deps.tg.send(chatId, failure(error)));
      }
      if (started.pending_file) return addReceipt(deps, person, started, started.pending_file, started.pending_caption ?? "");
      await showCard(deps, person, started);
      return void (await deps.tg.send(chatId, liqWords.first));
    }
    case "submit":
      return submit(deps, person, draft);
    case "back":
      return showCard(deps, person, await deps.liq.store.updateDraft(draft.id, { status: "draft", edit_line: null }));
    case "lines":
      return lineMenu(deps, draft);
    case "dept": {
      const next = await deps.liq.store.updateDraft(draft.id, { status: "editing_department", edit_line: null });
      await showCard(deps, person, next);
      return void (await deps.tg.send(chatId, liqWords.needDepartment));
    }
    case "line":
    case "lpar":
    case "lamt":
    case "lpho":
    case "lspl":
    case "ldel": {
      const lines = await deps.liq.store.lines(draft.id);
      const target = lines.find((line) => line.id.startsWith(extra ?? "\u0000")) ?? lines.find((line) => line.id === draft.edit_line);
      if (!target) return;
      const k = draft.id.slice(0, 8);
      const l = target.id.slice(0, 8);
      if (action === "line") {
        const body = `✏️ <b>${esc(target.particulars || "Resibo")}</b> — ${target.amount ? formatPHP(target.amount) : "❓"}`;
        const markup: Markup = { inline_keyboard: [[{ text: "📌 Palitan ang paliwanag", callback_data: `lq:lpar:${k}:${l}` }], [{ text: "💰 Palitan ang halaga", callback_data: `lq:lamt:${k}:${l}` }], [{ text: "📎 Dagdag na larawan", callback_data: `lq:lpho:${k}:${l}` }], [{ text: "✂️ Hatiin ang resibo", callback_data: `lq:lspl:${k}:${l}` }], [{ text: "🗑 Tanggalin ang resibo", callback_data: `lq:ldel:${k}:${l}` }], [{ text: "⬅️ Bumalik", callback_data: `lq:lines:${k}` }]] };
        if (draft.message_id) await deps.tg.edit(chatId, draft.message_id, body, markup);
        return;
      }
      if (action === "ldel") {
        await deps.liq.store.removeLine(target.id);
        return showCard(deps, person, await deps.liq.store.updateDraft(draft.id, { status: "draft", edit_line: null }));
      }
      const status = { lpar: "editing_particulars", lamt: "editing_amount", lpho: "adding_photo", lspl: "splitting" }[action] as LiqStatus;
      await deps.liq.store.updateDraft(draft.id, { status, edit_line: target.id });
      const prompt = { lpar: liqWords.needParticulars, lamt: liqWords.needAmount, lpho: liqWords.addPhoto, lspl: liqWords.split(target.amount ?? target.read_amount) }[action];
      return void (await deps.tg.send(chatId, prompt));
    }
  }
}
