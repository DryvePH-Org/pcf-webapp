import { describe, expect, it } from "vitest";

import { applyShared, deriveShared, fillEmptyNa, ownAfterEdit, type PlateAccess } from "@/lib/plate-sharing";

type Line = { id: string; plate: string };
const access: PlateAccess<Line> = { get: (line) => line.plate, set: (line, plate) => ({ ...line, plate }) };
const lines = (...plates: string[]): Line[] => plates.map((plate, i) => ({ id: `l${i + 1}`, plate }));

describe("one plate for the whole liquidation", () => {
  it("typing it once fills every line; a line with its own plate keeps it", () => {
    const start = lines("", "", "");
    expect(applyShared(start, "ABC 123", [], access).map((l) => l.plate)).toEqual(["ABC 123", "ABC 123", "ABC 123"]);
    expect(applyShared(start, "ABC 123", ["l2"], access).map((l) => l.plate)).toEqual(["ABC 123", "", "ABC 123"]);
  });

  it("a line edited to a different plate keeps its own; changed back to the shared one it follows again", () => {
    expect(ownAfterEdit([], "l2", "XYZ 789", "ABC 123")).toEqual(["l2"]);
    expect(ownAfterEdit(["l2"], "l2", "abc 123", "ABC 123")).toEqual([]);
    expect(ownAfterEdit(["l2"], "l2", "", "ABC 123")).toEqual([]);
  });

  it("a saved draft opens with the plate most lines use, and the odd ones keep theirs", () => {
    const result = deriveShared(lines("ABC 123", "abc 123", "XYZ 789", ""), access);
    expect(result.shared).toBe("ABC 123");
    expect(result.own).toEqual(["l3"]);
    expect(deriveShared(lines("", ""), access)).toEqual({ shared: "", own: [] });
    expect(deriveShared(lines("N/A", "N/A", "ABC 123"), access).shared).toBe("N/A");
  });
});

describe("N/A for every empty field in one tap", () => {
  it("fills only the empty fields and counts them, and never touches what was typed", () => {
    const rows = [
      { id: "a", plate: "", supplier: "Shop", tin: "", receipt_number: "" },
      { id: "b", plate: "ABC 123", supplier: "", tin: "111", receipt_number: "  " },
    ];
    const { lines: next, filled } = fillEmptyNa(rows, ["plate", "supplier", "tin", "receipt_number"]);
    expect(filled).toBe(5);
    expect(next[0]).toMatchObject({ plate: "N/A", supplier: "Shop", tin: "N/A", receipt_number: "N/A" });
    expect(next[1]).toMatchObject({ plate: "ABC 123", supplier: "N/A", tin: "111", receipt_number: "N/A" });
    expect(fillEmptyNa(next, ["plate", "supplier", "tin", "receipt_number"]).filled).toBe(0);
  });
});
