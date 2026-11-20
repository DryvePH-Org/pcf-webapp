import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { handleUpdate, words, type Deps, type Draft, type Markup, type Person, type TgUpdate } from "@/lib/telegram/flow";

const FUND_A = { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Buying PCF" };
const FUND_B = { id: "bbbbbbbb-0000-4000-8000-000000000002", name: "DRYVE PCF" };
const CHAT = 1001;
const PERSON: Person = { id: "11111111-0000-4000-8000-000000000001", name: "Maria Santos" };

type Sent = { chat: number; text: string; markup?: Markup; id: number; seq: number };

function world(options: { funds?: typeof FUND_A[]; spoken?: { amount: string; purpose: string; fund_id: string }; transcript?: string; createFails?: string } = {}) {
  const funds = options.funds ?? [FUND_A];
  const state = {
    seen: new Set<number>(),
    links: new Map<number, Person>([[CHAT, PERSON]]),
    codes: new Map<string, Person>([["GOODCODE", PERSON]]),
    drafts: [] as (Draft & { done: boolean; request_id?: string })[],
    sent: [] as Sent[],
    edits: [] as Sent[],
    answers: [] as { id: string; text?: string }[],
    requests: [] as { person: string; fund: string; amount: number; purpose: string }[],
    notified: [] as string[],
    transcript: options.transcript ?? "Kailangan ko ng 800 para sa gasolina",
    spoken: options.spoken ?? { amount: "800.00", purpose: "Gasolina ng service", fund_id: "" },
    repeat: false,
    nextMessage: 100,
    seq: 0,
    nextDraft: 1,
    transcribeFails: false,
  };
  const open = (chat: number) => state.drafts.find((d) => d.chat_id === chat && !d.done && ["draft", "editing_amount", "editing_purpose"].includes(d.status));
  const deps: Deps = {
    store: {
      firstSeen: async (id) => (state.seen.has(id) ? false : (state.seen.add(id), true)),
      profileOf: async (chat) => state.links.get(chat) ?? null,
      redeem: async (code, chat) => {
        const person = state.codes.get(code);
        if (!person) throw new Error("expired");
        state.codes.delete(code);
        state.links.set(chat, person);
        return person;
      },
      funds: async () => funds,
      openDraft: async (chat) => open(chat) ?? null,
      newDraft: async (input) => {
        const old = open(input.chatId);
        if (old) old.done = true;
        const draft = { id: `d${state.nextDraft++}`, chat_id: input.chatId, profile_id: input.profileId, fund_id: input.fundId, amount: input.amount, purpose: input.purpose, transcript: input.transcript, status: "draft" as const, message_id: input.messageId, done: false };
        state.drafts.push(draft);
        return draft;
      },
      updateDraft: async (id, patch) => Object.assign(state.drafts.find((d) => d.id === id)!, patch),
      claimSubmit: async (id) => {
        const d = state.drafts.find((x) => x.id === id)!;
        if (d.status !== "draft" || d.done) return false;
        d.done = true;
        return true;
      },
      releaseSubmit: async (id) => void (state.drafts.find((d) => d.id === id)!.done = false),
      finishDraft: async (id, requestId) => void (state.drafts.find((d) => d.id === id)!.request_id = requestId),
      cancelDraft: async (id) => void (state.drafts.find((d) => d.id === id)!.done = true),
      createRequest: async (person, fund, amount, purpose) => {
        if (options.createFails) throw new Error(options.createFails);
        state.requests.push({ person, fund, amount, purpose });
        return { id: `req${state.requests.length}`, ref: "BR-ABCD1234" };
      },
    },
    tg: {
      send: async (chat, text, markup) => {
        const id = state.nextMessage++;
        state.sent.push({ chat, text, markup, id, seq: state.seq++ });
        return id;
      },
      edit: async (chat, id, text, markup) => void state.edits.push({ chat, text, markup, id, seq: state.seq++ }),
      answer: async (id, text) => void state.answers.push({ id, text }),
      voice: async () => new Blob(["audio"]),
    },
    voice: {
      transcribe: async () => {
        if (state.transcribeFails) throw new Error("no");
        return state.transcript;
      },
      extract: async (_t, list) => ({ ...state.spoken, fund_id: list.some((f) => f.id === state.spoken.fund_id) ? state.spoken.fund_id : "" }),
    },
    limit: async () => true,
    repeat: async () => state.repeat,
    afterRequest: (id) => void state.notified.push(id),
  };
  let n = 1;
  const send = (update: Omit<TgUpdate, "update_id">) => handleUpdate({ update_id: n++, ...update } as TgUpdate, deps);
  const voice = (chat = CHAT) => send({ message: { message_id: 1, chat: { id: chat, type: "private" }, voice: { file_id: "f", duration: 8, file_size: 20000 } } });
  const text = (value: string, chat = CHAT) => send({ message: { message_id: 1, chat: { id: chat, type: "private" }, text: value } });
  const press = (data: string, messageId = 100, chat = CHAT) => send({ callback_query: { id: `cb${n}`, data, message: { message_id: messageId, chat: { id: chat, type: "private" } } } });
  const last = () => [...state.edits, ...state.sent].sort((a, b) => a.seq - b.seq).at(-1)!;
  const lastDraft = () => state.drafts.at(-1)!;
  return { state, deps, send, voice, text, press, last, lastDraft, open };
}

const labels = (markup?: Markup) => (markup?.inline_keyboard ?? []).flat().map((b) => b.text);

describe("linking", () => {
  it("links a person with a good code, and says so by name", async () => {
    const w = world();
    w.state.links.clear();
    await w.text("/start GOODCODE");
    expect(w.state.links.get(CHAT)).toEqual(PERSON);
    expect(w.state.sent.at(-1)!.text).toContain("Naka-link ka na, Maria");
  });
  it("refuses a bad or used code without linking", async () => {
    const w = world();
    w.state.links.clear();
    await w.text("/start NOPE");
    expect(w.state.links.size).toBe(0);
    expect(w.state.sent.at(-1)!.text).toBe(words.badLink);
  });
  it("tells an unlinked person to ask the admin, and does nothing else", async () => {
    const w = world();
    w.state.links.clear();
    await w.voice();
    await w.text("500 pambili ng papel");
    expect(w.state.sent.map((s) => s.text)).toEqual([words.notLinked, words.notLinked]);
    expect(w.state.drafts).toHaveLength(0);
  });
  it("ignores a group chat", async () => {
    const w = world();
    await w.send({ message: { message_id: 1, chat: { id: -5, type: "group" }, text: "800 gas" } });
    expect(w.state.sent).toHaveLength(0);
    expect(w.state.drafts).toHaveLength(0);
  });
  it("counts each update once (Telegram resends until it is answered)", async () => {
    const w = world();
    const update = { update_id: 777, message: { message_id: 1, chat: { id: CHAT, type: "private" }, text: "/help" } } as TgUpdate;
    await handleUpdate(update, w.deps);
    await handleUpdate(update, w.deps);
    expect(w.state.sent).toHaveLength(1);
  });
});

describe("a voice message becomes a summary to check", () => {
  it("shows the amount, the reason and the only fund, with the buttons", async () => {
    const w = world();
    await w.voice();
    expect(w.state.sent[0].text).toBe(words.working);
    const summary = w.last();
    expect(summary.text).toContain("₱800.00");
    expect(summary.text).toContain("Gasolina ng service");
    expect(summary.text).toContain("Buying PCF");
    expect(labels(summary.markup)).toEqual(["✅ Submit", "💰 Palitan ang halaga", "📌 Palitan ang dahilan", "❌ Kanselahin"]);
    expect(w.lastDraft().fund_id).toBe(FUND_A.id);
  });
  it("asks which fund when there are several and none was named", async () => {
    const w = world({ funds: [FUND_A, FUND_B] });
    await w.voice();
    expect(w.last().text).toContain("❓ <i>piliin</i>");
    expect(labels(w.last().markup)).not.toContain("✅ Submit");
    expect(labels(w.last().markup)).toContain("🏦 Palitan ang fund");
  });
  it("uses the fund the speaker named", async () => {
    const w = world({ funds: [FUND_A, FUND_B], spoken: { amount: "800.00", purpose: "Gas", fund_id: FUND_B.id } });
    await w.voice();
    expect(w.lastDraft().fund_id).toBe(FUND_B.id);
    expect(labels(w.last().markup)).toContain("✅ Submit");
  });
  it("says so when it cannot read the recording, and makes no draft", async () => {
    const w = world();
    w.state.transcribeFails = true;
    await w.voice();
    expect(w.last().text).toBe(words.couldNotRead);
    expect(w.state.drafts).toHaveLength(0);
  });
  it("turns away a recording that is too long", async () => {
    const w = world();
    await w.send({ message: { message_id: 1, chat: { id: CHAT, type: "private" }, voice: { file_id: "f", duration: 200 } } });
    expect(w.state.sent.at(-1)!.text).toBe(words.tooLong);
  });
  it("protects the display from what people say (angle brackets)", async () => {
    const w = world({ spoken: { amount: "500.00", purpose: "<b>papel</b> & tinta", fund_id: "" } });
    await w.voice();
    expect(w.last().text).toContain("&lt;b&gt;papel&lt;/b&gt; &amp; tinta");
    expect(w.last().text).not.toContain("<b>papel");
  });
});

describe("checking and correcting", () => {
  it("changes the amount by tapping the button and saying the number", async () => {
    const w = world();
    await w.voice();
    await w.press(`amt:${w.lastDraft().id}`);
    expect(w.state.sent.at(-1)!.text).toBe(words.needAmount);
    w.state.transcript = "ang tama ay 950";
    await w.voice();
    expect(w.lastDraft().amount).toBe(950);
    expect(w.last().text).toContain("₱950.00");
    expect(w.state.drafts).toHaveLength(1);
  });
  it("changes the amount by typing, and refuses a typed amount that has no number", async () => {
    const w = world();
    await w.voice();
    await w.press(`amt:${w.lastDraft().id}`);
    await w.text("dalawang libo");
    expect(w.state.sent.at(-1)!.text).toBe(words.badAmount);
    expect(w.lastDraft().amount).toBe(800);
    await w.text("₱2,500");
    expect(w.lastDraft().amount).toBe(2500);
  });
  it("changes the reason", async () => {
    const w = world();
    await w.voice();
    await w.press(`pur:${w.lastDraft().id}`);
    await w.text("Pambili ng printer ink");
    expect(w.lastDraft().purpose).toBe("Pambili ng printer ink");
    expect(w.last().text).toContain("Pambili ng printer ink");
  });
  it("picks a fund from the menu", async () => {
    const w = world({ funds: [FUND_A, FUND_B] });
    await w.voice();
    await w.press(`fundmenu:${w.lastDraft().id}`);
    expect(labels(w.last().markup)).toEqual(expect.arrayContaining(["Buying PCF", "DRYVE PCF"]));
    await w.press(`fund:${w.lastDraft().id}:${FUND_B.id.slice(0, 8)}`);
    expect(w.lastDraft().fund_id).toBe(FUND_B.id);
    expect(labels(w.last().markup)).toContain("✅ Submit");
  });
  it("does not let Submit through with a missing amount, and asks for it instead", async () => {
    const w = world({ spoken: { amount: "", purpose: "Gas", fund_id: "" } });
    await w.voice();
    expect(labels(w.last().markup)).not.toContain("✅ Submit");
    await w.press(`submit:${w.lastDraft().id}`);
    expect(w.state.requests).toHaveLength(0);
    expect(w.lastDraft().status).toBe("editing_amount");
    expect(w.state.sent.at(-1)!.text).toBe(words.needAmount);
  });
  it("cancels", async () => {
    const w = world();
    await w.voice();
    await w.press(`cancel:${w.lastDraft().id}`);
    expect(w.open(CHAT)).toBeUndefined();
    expect(w.last().text).toBe(words.cancelled);
  });
  it("a button from an old summary does nothing harmful", async () => {
    const w = world();
    await w.voice();
    const old = w.lastDraft().id;
    w.state.transcript = "Kailangan ko ng 300 para sa tubig";
    w.state.spoken = { amount: "300.00", purpose: "Tubig", fund_id: "" };
    await w.voice();
    await w.press(`submit:${old}`);
    expect(w.state.requests).toHaveLength(0);
    expect(w.state.answers.at(-1)!.text).toBe(words.oldButton);
  });
});

describe("typed words", () => {
  it("do not start a request unless they carry an amount", async () => {
    const w = world();
    await w.text("salamat po");
    expect(w.state.drafts).toHaveLength(0);
    expect(w.state.sent.at(-1)!.text).toBe(words.help);
  });
  it("start one when they do", async () => {
    const w = world({ spoken: { amount: "2500.00", purpose: "pambili ng gasolina", fund_id: "" } });
    await w.text("2500 pambili ng gasolina");
    expect(w.lastDraft().amount).toBe(2500);
  });
});

describe("submitting", () => {
  it("makes the request as the linked person, once, and tells the reviewers", async () => {
    const w = world();
    await w.voice();
    await w.press(`submit:${w.lastDraft().id}`);
    expect(w.state.requests).toEqual([{ person: PERSON.id, fund: FUND_A.id, amount: 800, purpose: "Gasolina ng service" }]);
    expect(w.last().text).toContain("Naipasa na ang request mo");
    expect(w.last().text).toContain("BR-ABCD1234");
    expect(w.state.notified).toEqual(["req1"]);
    expect(w.lastDraft().request_id).toBe("req1");
  });
  it("a second tap on Submit does not make a second request", async () => {
    const w = world();
    await w.voice();
    const id = w.lastDraft().id;
    await Promise.all([w.press(`submit:${id}`), w.press(`submit:${id}`)]);
    expect(w.state.requests).toHaveLength(1);
  });
  it("keeps the draft open and says why when the rules refuse (for example the fund's limit)", async () => {
    const w = world({ createFails: "This fund allows at most 1000.00 for one request" });
    await w.voice();
    await w.press(`submit:${w.lastDraft().id}`);
    expect(w.state.sent.at(-1)!.text).toContain("This fund allows at most 1000.00");
    expect(w.open(CHAT)).toBeDefined();
    expect(w.state.notified).toHaveLength(0);
  });
  it("refuses a repeat of the very same request", async () => {
    const w = world();
    await w.voice();
    w.state.repeat = true;
    await w.press(`submit:${w.lastDraft().id}`);
    expect(w.state.requests).toHaveLength(0);
    expect(w.state.sent.at(-1)!.text).toBe(words.alreadyDone);
  });
});

beforeEach(() => vi.clearAllMocks());
