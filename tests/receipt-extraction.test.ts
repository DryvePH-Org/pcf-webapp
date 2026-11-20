import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { extractPhilippineReceipt } from "@/lib/receipt-extraction";

const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
const good = {
  supplier: "Sample Hardware", tin: "123-456-789-00000", tag: "CE - Supplies", expense_date: "2026-11-18", plate: "",
  receipt_number: "004512", amount: "420.00", warnings: [], tax_status: "vat", tax_status_evidence: "VAT REG",
  confidence: { supplier: "high", tin: "high", tag: "high", expense_date: "high", plate: "high", receipt_number: "high", amount: "high" },
};
const answer = (content: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(status === 200 ? { choices: [{ finish_reason: "stop", message: { content } }] } : { error: { message: "limit" } }), { status, headers });

beforeEach(() => vi.stubEnv("GROQ_API_KEY", "test-key"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("asks for a plain JSON object (strict schema mode returns broken JSON for this model) and reads the answer", async () => {
  const fetchMock = vi.fn().mockResolvedValue(answer(JSON.stringify(good)));
  vi.stubGlobal("fetch", fetchMock);
  const result = await extractPhilippineReceipt(image, ["CE - Supplies"]);
  expect(result.suggestion).toMatchObject({ supplier: "Sample Hardware", amount: "420.00", expense_date: "2026-11-18", tag: "CE - Supplies" });
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.response_format).toEqual({ type: "json_object" });
  expect(JSON.stringify(body.messages[0].content)).toContain("expense_date (YYYY-MM-DD)");
});

it("accepts an answer wrapped in a code fence and fills what is missing with empty fields", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer("```json\n" + JSON.stringify({ supplier: "Sample", amount: "99.50" }) + "\n```")));
  const result = await extractPhilippineReceipt(image, []);
  expect(result.suggestion).toMatchObject({ supplier: "", amount: "" });
  expect(result.warnings.length).toBeGreaterThan(0);
});

it("waits the few seconds Groq asks for, then reads the receipt", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(answer("", 429, { "retry-after": "1" }))
    .mockResolvedValueOnce(answer(JSON.stringify(good)));
  vi.stubGlobal("fetch", fetchMock);
  const result = await extractPhilippineReceipt(image, []);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.suggestion.amount).toBe("420.00");
});

it("tells the person how long to wait when the limit is still reached", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer("", 429, { "retry-after": "40" })));
  await expect(extractPhilippineReceipt(image, [])).rejects.toThrow(/per-minute limit.*40 seconds/);
});
