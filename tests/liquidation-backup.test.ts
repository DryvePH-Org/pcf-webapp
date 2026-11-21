import { expect, it } from "vitest";

import { clearBackup, normalizeForm, restorable, saveBackup } from "@/lib/liquidation-backup";
import type { LiquidationFormValues } from "@/lib/validators/liquidation";

const id = "11111111-1111-4111-8111-111111111111";
const line = "22222222-2222-4222-8222-222222222222";
const server = (patch: Partial<LiquidationFormValues["items"][number]> = {}): LiquidationFormValues => ({
  id, department: "Operations", filing_date: "2026-11-20", unspent_reason: "",
  items: [{ id: line, particulars: "Supplies", amount: "900.00", receipt_path: "", no_receipt_reason: "", sheet_details: { plate: "" }, ...patch }],
});
function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

it("brings back what was typed after an unexpected reload", () => {
  const store = memory();
  const typed = server({ particulars: "Supplies for the office", amount: "", receipt_path: `${id}/${line}/photo.jpg` });
  saveBackup(store, typed, server());
  expect(restorable(store, server())).toEqual(typed);
});

it("does nothing when the saved version already matches, even if typed as 450 and saved as 450.00", () => {
  const store = memory();
  saveBackup(store, server({ amount: "900" }), server());
  expect(restorable(store, server())).toBeNull();
});

it("lets the saved version win when it moved on after the copy was made", () => {
  const store = memory();
  saveBackup(store, server({ particulars: "Typed offline" }), server());
  expect(restorable(store, server({ particulars: "Saved from another phone" }))).toBeNull();
});

it("forgets old copies, other liquidations and cleared copies", () => {
  const store = memory();
  saveBackup(store, server({ particulars: "x" }), server());
  expect(restorable(store, server(), Date.now() + 15 * 24 * 60 * 60 * 1000)).toBeNull();
  clearBackup(store, id);
  expect(restorable(store, server())).toBeNull();
  expect(restorable(null, server())).toBeNull();
});

it("compares forms without typing differences", () => {
  expect(normalizeForm(server({ amount: "900" }))).toBe(normalizeForm(server({ amount: "900.00" })));
  expect(normalizeForm(server({ particulars: " Supplies " }))).toBe(normalizeForm(server()));
});
