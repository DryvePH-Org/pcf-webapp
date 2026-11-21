import { expect, it } from "vitest";

import { latestReplenishmentNumber } from "@/lib/sheets/grid";
import type { Cell } from "@/lib/sheets/types";

const text = (value: string): Cell => ({ userEnteredValue: { stringValue: value }, effectiveValue: { stringValue: value }, formattedValue: value });
const num = (value: number): Cell => ({ effectiveValue: { numberValue: value } });
const row = (cells: Record<number, Cell>): Cell[] => Array.from({ length: 16 }, (_, i) => cells[i] ?? {});
const IN = 12; // Buying: column M

it("Buying: a staff-typed REPLENISHMENT #13 with no amount does not move the numbering", () => {
  const grid = [
    row({ 1: text("REPLENISHMENT #12"), [IN]: num(31112.4), 14: num(40000) }),
    row({ 1: num(1) }),
    row({ 1: text("REPLENISHMENT #13"), 14: num(7427) }), // a typed row: a balance formula, no IN amount
  ];
  expect(latestReplenishmentNumber(grid, IN)).toBe(12);
});

it("Buying: the marker counts as soon as it carries its amount, in column B or F", () => {
  const funded = [row({ 1: text("REPLENISHMENT #12"), [IN]: num(1) }), row({ 5: text("PCF REPLENISHMENT #13"), [IN]: num(25000) })];
  expect(latestReplenishmentNumber(funded, IN)).toBe(13);
});

it("without a column the label alone counts, as before", () => {
  expect(latestReplenishmentNumber([row({ 1: text("REPLENISHMENT #13") })])).toBe(13);
});
