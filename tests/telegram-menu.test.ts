import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { setMenuCommands } from "@/lib/telegram/api";
import { words } from "@/lib/telegram/flow";
import { liqWords } from "@/lib/telegram/liquidation-flow";

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:test-token");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("the welcome message tells a new person both things they can do, with an example of each", () => {
  const text = words.linked("Maria Santos");
  expect(text).toContain("Maria");
  expect(text).toContain("Humingi ng budget");
  expect(text).toContain("Mag-liquidate ng resibo");
  expect(text).toContain("bilang larawan, hindi file");
  expect(text).toContain("gasolina 450");
  expect(text).toContain("/help");
});

it("help and the first-receipt prompt explain the caption and the Submit step", () => {
  expect(words.help).toContain("Mag-liquidate ng resibo");
  expect(words.help).toContain("/cancel");
  expect(liqWords.first).toContain("gasolina 450");
  expect(liqWords.first).toContain("Itatanong ko");
});

it("sets the chat menu: Liquidate, Help and Cancel, shown as the menu button", async () => {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: String(url).split("/").pop()!, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true, result: true }));
    }),
  );
  await setMenuCommands();
  expect(calls.map((c) => c.method)).toEqual(["setMyCommands", "setChatMenuButton"]);
  const commands = (calls[0].body.commands as { command: string }[]).map((c) => c.command);
  expect(commands).toEqual(["liquidate", "help", "cancel"]);
  expect(calls[1].body).toEqual({ menu_button: { type: "commands" } });
});
