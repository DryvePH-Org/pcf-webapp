import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { handleUpdate, type Deps, type Markup, type Person, type TgUpdate } from "@/lib/telegram/flow";
import { liqWords, pickPhoto, splitCaption, type LiqDraft, type LiqLine, type Outstanding } from "@/lib/telegram/liquidation-flow";

const CHAT = 2002;
const PERSON: Person = { id: "22222222-0000-4000-8000-000000000001", name: "Pedro Reyes" };
const V1: Outstanding = { voucher_id: "aaaa1111-0000-4000-8000-000000000001", pcv_number: "PCV-2026-0001", fund_name: "Buying PCF", amount: 1000, overdue: false, elsewhere: false };
const V2: Outstanding = { voucher_id: "bbbb2222-0000-4000-8000-000000000002", pcv_number: "PCV-2026-0002", fund_name: "DRYVE PCF", amount: 500, overdue: true, elsewhere: false };

type Sent = { text: string; markup?: Markup; id: number; seq: number };

function world(options: { outstanding?: Outstanding[]; department?: string; read?: string; submitFails?: string } = {}) {
  const state = {
    seen: new Set<number>(),
    draft: null as (LiqDraft & { open: boolean; claimed?: boolean }) | null,
    lines: [] as LiqLine[],
    sent: [] as Sent[],
    edits: [] as Sent[],
    uploads: [] as { liquidation: string; line: string }[],
    submitted: [] as { draft: LiqDraft; lines: LiqLine[] }[],
    notified: [] as string[],
    answers: [] as (string | undefined)[],
    seq: 0,
    message: 500,
    read: options.read ?? "",
  };
  const outstanding = options.outstanding ?? [V1];
  const open = () => (state.draft?.open ? state.draft : null);
  const patchDraft = (patch: Partial<LiqDraft>) => Object.assign(state.draft!, patch);
  const deps: Deps = {
    store: {
      firstSeen: async (id: number) => (state.seen.has(id) ? false : (state.seen.add(id), true)),
      profileOf: async () => PERSON,
      openDraft: async () => null,
    } as unknown as Deps["store"],
    tg: {
      send: async (_chat, text, markup) => {
        const id = state.message++;
        state.sent.push({ text, markup, id, seq: state.seq++ });
        return id;
      },
      edit: async (_chat, id, text, markup) => void state.edits.push({ text, markup, id, seq: state.seq++ }),
      answer: async (_id, text) => void state.answers.push(text),
      voice: async () => new Blob(["audio"]),
    },
    voice: { transcribe: async () => "gasolina 300", extract: async () => ({ amount: "", purpose: "", fund_id: "" }) },
    limit: async () => true,
    repeat: async () => false,
    afterRequest: () => undefined,
    afterLiquidation: (id) => void state.notified.push(id),
    liq: {
      store: {
        outstanding: async () => outstanding,
        openDraft: async () => open(),
        begin: async (input) => {
          if (state.draft) state.draft.open = false;
          state.lines = [];
          state.draft = {
            id: "dddddddd-0000-4000-8000-000000000001", chat_id: input.chatId, profile_id: input.profileId, voucher_id: input.voucherId,
            liquidation_id: input.voucherId ? "eeeeeeee-0000-4000-8000-000000000001" : null, department: options.department ?? "Operations",
            status: input.voucherId ? "draft" : "choosing", edit_line: null, message_id: null, pending_file: input.pendingFile, pending_caption: input.pendingCaption, open: true,
          };
          return state.draft;
        },
        choose: async (draft, _p, voucherId) => {
          const before = { ...draft };
          patchDraft({ voucher_id: voucherId, liquidation_id: "eeeeeeee-0000-4000-8000-000000000001", status: "draft", pending_file: null, pending_caption: null });
          return { ...state.draft!, pending_file: before.pending_file, pending_caption: before.pending_caption };
        },
        updateDraft: async (_id, patch) => patchDraft(patch),
        lines: async () => state.lines,
        addLine: async (input) => {
          const line: LiqLine = { id: input.id, particulars: input.particulars, amount: input.amount, receipt_path: input.receiptPath, read_amount: null, reading: input.reading };
          state.lines.push(line);
          return line;
        },
        updateLine: async (id, patch) => void Object.assign(state.lines.find((l) => l.id === id)!, patch),
        removeLine: async (id) => void (state.lines = state.lines.filter((l) => l.id !== id)),
        setRead: async (id, amount) => {
          const line = state.lines.find((l) => l.id === id)!;
          line.read_amount = amount;
          line.reading = false;
          if (amount && !line.amount) line.amount = amount;
        },
        claimSubmit: async () => {
          if (!state.draft?.open || state.draft.claimed) return false;
          state.draft.claimed = true;
          return true;
        },
        releaseSubmit: async () => void (state.draft!.claimed = false),
        submit: async (draft, lines) => {
          if (options.submitFails) throw new Error(options.submitFails);
          state.submitted.push({ draft: { ...draft }, lines: lines.map((l) => ({ ...l })) });
          state.draft!.open = false;
        },
        cancel: async () => void (state.draft!.open = false),
      },
      files: {
        photo: async () => new Blob(["jpg"], { type: "image/jpeg" }),
        upload: async (liquidation, line) => {
          state.uploads.push({ liquidation, line });
          return `${liquidation}/${line}/x.jpg`;
        },
        read: async () => state.read,
      },
    },
  };
  let n = 1;
  const send = (update: Omit<TgUpdate, "update_id">) => handleUpdate({ update_id: n++, ...update } as TgUpdate, deps);
  const chat = { id: CHAT, type: "private" };
  const photo = (caption?: string) => send({ message: { message_id: 1, chat, caption, photo: [{ file_id: "small", width: 90, height: 90 }, { file_id: "big", width: 1280, height: 960, file_size: 150000 }] } });
  const text = (value: string) => send({ message: { message_id: 1, chat, text: value } });
  const press = (data: string, messageId = 500) => send({ callback_query: { id: `cb${n}`, data, message: { message_id: messageId, chat } } });
  const all = () => [...state.edits, ...state.sent].sort((a, b) => a.seq - b.seq);
  const last = () => all().at(-1)!;
  const lastCard = () => [...all()].reverse().find((m) => m.text.includes("Liquidation mo"))!;
  return { state, send, photo, text, press, last, lastCard, deps };
}
const labels = (markup?: Markup) => (markup?.inline_keyboard ?? []).flat().map((b) => b.text);

describe("reading a caption", () => {
  it("takes the amount only from the first or last word", () => {
    expect(splitCaption("gasolina 450")).toEqual({ particulars: "gasolina", amount: 450 });
    expect(splitCaption("Pamasahe ₱1,250.50")).toEqual({ particulars: "Pamasahe", amount: 1250.5 });
    expect(splitCaption("₱300 pagkain")).toEqual({ particulars: "pagkain", amount: 300 });
    expect(splitCaption("gasolina ng service")).toEqual({ particulars: "gasolina ng service", amount: null });
    expect(splitCaption("2 gulong para sa trak")).toEqual({ particulars: "2 gulong para sa trak", amount: null });
  });
  it("never takes a plate number for money", () => {
    expect(splitCaption("gas for ABC 1234").amount).toBeNull();
    expect(splitCaption("gas ABC 123 ₱450").amount).toBe(450);
  });
  it("picks the largest picture that is still receipt-sized", () => {
    expect(pickPhoto([{ file_id: "a", width: 90, height: 90 }, { file_id: "b", width: 1280, height: 960 }, { file_id: "c", width: 2560, height: 1920 }])?.file_id).toBe("b");
    expect(pickPhoto([])).toBeNull();
  });
});

describe("filing a liquidation in the chat", () => {
  it("one advance and a captioned photo: the line is saved and Submit makes the liquidation", async () => {
    const w = world();
    await w.photo("gasolina 450");
    expect(w.state.uploads).toHaveLength(1);
    expect(w.state.uploads[0].line).toBe(w.state.lines[0].id);
    expect(w.state.lines[0]).toMatchObject({ particulars: "gasolina", amount: 450 });
    const card = w.lastCard();
    expect(card.text).toContain("₱450.00");
    expect(card.text).toContain("Isasauli sa custodian");
    expect(labels(card.markup)).toContain("✅ Submit");
    await w.press("lq:submit:dddddddd");
    expect(w.state.submitted).toHaveLength(1);
    expect(w.state.submitted[0].lines[0].receipt_path).toContain("eeeeeeee-0000-4000-8000-000000000001/");
    expect(w.state.notified).toEqual(["eeeeeeee-0000-4000-8000-000000000001"]);
    expect(w.last().text).toContain("Naipasa na ang liquidation");
  });

  it("a second tap on Submit files nothing twice", async () => {
    const w = world();
    await w.photo("gasolina 450");
    await w.press("lq:submit:dddddddd");
    await w.press("lq:submit:dddddddd");
    expect(w.state.submitted).toHaveLength(1);
  });

  it("without a caption the bot asks what it was for, then reads the amount from the receipt", async () => {
    const w = world({ read: "450.00" });
    await w.photo();
    expect(w.state.draft!.status).toBe("editing_particulars");
    expect(w.state.sent.map((m) => m.text)).toContain(liqWords.needParticulars);
    await w.text("gasolina ng service");
    expect(w.state.lines[0]).toMatchObject({ particulars: "gasolina ng service", amount: 450 });
    expect(w.state.draft!.status).toBe("draft");
    expect(w.lastCard().text).toContain("₱450.00");
  });

  it("asks for the amount when the receipt cannot be read, and warns when it differs from what was read", async () => {
    const w = world({ read: "" });
    await w.photo("gasolina");
    expect(w.state.draft!.status).toBe("editing_amount");
    expect(w.last().text).toBe(liqWords.needAmount);
    await w.text("not a number");
    expect(w.last().text).toBe(liqWords.badAmount);
    await w.text("300");
    expect(w.state.lines[0].amount).toBe(300);

    const other = world({ read: "450.00" });
    await other.photo("gas");
    await other.press("lq:lamt:dddddddd:" + other.state.lines[0].id.slice(0, 8));
    await other.text("400");
    expect(other.lastCard().text).toContain("nabasa sa resibo");
  });

  it("a plate in the caption is not taken for the amount", async () => {
    const w = world({ read: "" });
    await w.photo("gas for ABC 1234");
    expect(w.state.lines[0].amount).toBeNull();
    expect(w.state.draft!.status).toBe("editing_amount");
  });

  it("several advances: the photo waits for the choice, then is added", async () => {
    const w = world({ outstanding: [V1, V2] });
    await w.photo("gasolina 450");
    expect(w.state.draft!.status).toBe("choosing");
    expect(w.state.lines).toHaveLength(0);
    expect(labels(w.last().markup).some((l) => l.includes("PCV-2026-0002"))).toBe(true);
    await w.photo("another");
    expect(w.last().text).toBe(liqWords.choosing);
    await w.press("lq:pick:dddddddd:bbbb2222");
    expect(w.state.draft!.voucher_id).toBe(V2.voucher_id);
    expect(w.state.lines).toHaveLength(1);
    expect(w.state.lines[0].amount).toBe(450);
  });

  it("asks for the department once when there is none, and will not submit without it", async () => {
    const w = world({ department: "" });
    await w.photo("gasolina 450");
    expect(labels(w.lastCard().markup)).not.toContain("✅ Submit");
    await w.press("lq:dept:dddddddd");
    await w.text("Operations");
    expect(w.state.draft!.department).toBe("Operations");
    expect(labels(w.lastCard().markup)).toContain("✅ Submit");
  });

  it("shows a reimbursement when the receipts are more than the advance", async () => {
    const w = world();
    await w.photo("gasolina 1500");
    expect(w.lastCard().text).toContain("Ire-reimburse");
  });

  it("keeps the draft when the rules refuse, so it can be corrected", async () => {
    const w = world({ submitFails: "Liquidation was already filed." });
    await w.photo("gasolina 450");
    await w.press("lq:submit:dddddddd");
    expect(w.last().text).toContain("Liquidation was already filed.");
    expect(w.state.draft!.status).toBe("draft");
    expect(w.state.notified).toHaveLength(0);
  });

  it("lets a receipt be removed and a spoken line be corrected", async () => {
    const w = world();
    await w.photo("gasolina 450");
    await w.photo("pagkain 200");
    expect(w.state.lines).toHaveLength(2);
    await w.press("lq:lines:dddddddd");
    await w.press("lq:ldel:dddddddd:" + w.state.lines[1].id.slice(0, 8));
    expect(w.state.lines).toHaveLength(1);
  });

  it("cancel drops the draft and an old button says it is old", async () => {
    const w = world();
    await w.photo("gasolina 450");
    await w.press("lq:cancel:dddddddd");
    expect(w.state.draft!.open).toBe(false);
    await w.press("lq:submit:dddddddd");
    expect(w.state.answers.at(-1)).toBe(liqWords.oldButton);
    expect(w.state.submitted).toHaveLength(0);
  });

  it("says so when there is nothing to liquidate, or it is finished elsewhere", async () => {
    const none = world({ outstanding: [] });
    await none.photo("gas 100");
    expect(none.last().text).toBe(liqWords.none);
    const elsewhere = world({ outstanding: [{ ...V1, elsewhere: true }] });
    await elsewhere.photo("gas 100");
    expect(elsewhere.last().text).toBe(liqWords.elsewhere);
  });

  it("asks for a photo, not a file", async () => {
    const w = world();
    await w.send({ message: { message_id: 1, chat: { id: CHAT, type: "private" }, document: { file_id: "f", mime_type: "image/jpeg" } } });
    expect(w.last().text).toBe(liqWords.asFile);
    expect(w.state.uploads).toHaveLength(0);
  });

  it("/liquidate with one advance opens the draft and asks for the first receipt", async () => {
    const w = world();
    await w.text("/liquidate");
    expect(w.state.draft!.status).toBe("draft");
    expect(w.last().text).toBe(liqWords.first);
  });
});
