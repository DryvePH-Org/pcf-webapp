import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { extractBudgetRequest, fundNamed, guessAmount } from "@/lib/voice/extract-request";
import { transcribeAudio, transcriptionConfigured } from "@/lib/voice/transcribe";

describe("reading an amount from what was said or typed", () => {
  it.each([
    ["2500", "2500.00"],
    ["₱2,500", "2500.00"],
    ["Kailangan ko ng 800 para sa gasolina", "800.00"],
    ["1,250.50 pesos", "1250.50"],
    ["5k para sa event", "5000.00"],
    ["800 piso, ulit 800", "800.00"],
  ])("%s -> %s", (said, amount) => expect(guessAmount(said)).toBe(amount));

  it.each([["dalawang libo"], ["salamat po"], [""], ["800 at 900"], ["0"]])("is not guessed from %j", (said) => expect(guessAmount(said)).toBe(""));
});

describe("the fund that was said by name", () => {
  const funds = [
    { id: "f-buying", name: "Buying PCF" },
    { id: "f-dryve", name: "DRYVE PCF" },
  ];
  it.each([
    ["Kailangan ko ng 800 para sa gasolina sa DRYVE", "f-dryve"],
    ["pambili ng papel sa buying", "f-buying"],
    ["dryve pcf po", "f-dryve"],
    ["para sa Dryv", "f-dryve"],
    // speech to text often writes the brand as the ordinary word
    ["para sa drive", "f-dryve"],
  ])("%s -> %s", (said, id) => expect(fundNamed(said, funds)).toBe(id));
  it.each([["800 para sa gasolina"], ["buying at dryve"], ["pcf fund"], [""]])("is not decided from %j (the person is asked)", (said) => expect(fundNamed(said, funds)).toBeNull());
});

describe("extracting a request without a language model", () => {
  beforeEach(() => vi.stubEnv("GROQ_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());
  it("takes the digits as the amount and the sentence as the purpose, and leaves the fund to the person", async () => {
    const result = await extractBudgetRequest("Kailangan ko ng 800 para sa gasolina", [{ id: "f", name: "Buying" }]);
    expect(result).toEqual({ amount: "800.00", purpose: "Kailangan ko ng 800 para sa gasolina", fund_id: "" });
  });
  it("takes the fund only when its name was clearly said", async () => {
    const funds = [{ id: "f1", name: "Buying PCF" }, { id: "f2", name: "DRYVE PCF" }];
    expect((await extractBudgetRequest("800 para sa gasolina sa DRYVE", funds)).fund_id).toBe("f2");
    expect((await extractBudgetRequest("800 para sa gasolina", funds)).fund_id).toBe("");
  });
});

describe("speech to text", () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const reply = (handlers: Record<string, () => Response>) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
        const key = Object.keys(handlers).find((k) => url.includes(k));
        if (!key) throw new Error(`unexpected ${url}`);
        return handlers[key]();
      }),
    );
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    calls.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("ELEVENLABS_API_BASE", "http://eleven.test");
    vi.stubEnv("GROQ_API_BASE", "http://groq.test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is on when either provider has a key", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    expect(transcriptionConfigured()).toBe(false);
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    expect(transcriptionConfigured()).toBe(true);
  });

  it("uses ElevenLabs first, with its key in the header and the language left to detect", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "eleven-key");
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    reply({ "/v1/speech-to-text": () => json({ text: "  Kailangan ko ng 800  ", language_code: "fil" }) });
    expect(await transcribeAudio(new Blob(["x"]), "voice.ogg")).toBe("Kailangan ko ng 800");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://eleven.test/v1/speech-to-text");
    expect(calls[0].headers["xi-api-key"]).toBe("eleven-key");
  });

  it("falls back to Groq when ElevenLabs fails", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "eleven-key");
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    reply({ "/v1/speech-to-text": () => json({ detail: "down" }, 503), "/audio/transcriptions": () => json({ text: "mula sa groq" }) });
    expect(await transcribeAudio(new Blob(["x"]), "voice.ogg")).toBe("mula sa groq");
    expect(calls.map((c) => c.url)).toEqual(["http://eleven.test/v1/speech-to-text", "http://groq.test/openai/v1/audio/transcriptions"]);
  });

  it("falls back when ElevenLabs hears nothing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "eleven-key");
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    reply({ "/v1/speech-to-text": () => json({ text: "   " }), "/audio/transcriptions": () => json({ text: "narinig ko" }) });
    expect(await transcribeAudio(new Blob(["x"]), "voice.ogg")).toBe("narinig ko");
  });

  it("works with only Groq, and with only ElevenLabs", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    reply({ "/audio/transcriptions": () => json({ text: "groq lang" }) });
    expect(await transcribeAudio(new Blob(["x"]), "v.ogg")).toBe("groq lang");
    vi.stubEnv("ELEVENLABS_API_KEY", "eleven-key");
    vi.stubEnv("GROQ_API_KEY", "");
    reply({ "/v1/speech-to-text": () => json({ text: "eleven lang" }) });
    expect(await transcribeAudio(new Blob(["x"]), "v.ogg")).toBe("eleven lang");
  });

  it("fails clearly when nothing can read it, and never logs the key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "secret-eleven");
    vi.stubEnv("GROQ_API_KEY", "secret-groq");
    reply({ "/v1/speech-to-text": () => json({}, 500), "/audio/transcriptions": () => json({}, 500) });
    await expect(transcribeAudio(new Blob(["x"]), "v.ogg")).rejects.toThrow("Could not read the recording.");
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("secret-eleven");
    expect(logged).not.toContain("secret-groq");
  });
});
