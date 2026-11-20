import { describe, expect, it } from "vitest";

import { plateCase, sentenceCase, titleCase } from "@/lib/proper-case";

describe("titleCase", () => {
  it.each([
    ["juan dela cruz", "Juan dela Cruz"],
    ["MARIA SANTOS", "Maria Santos"],
    ["maria  santos ", "Maria Santos"],
    ["o'brien", "O'Brien"],
    ["ana-maria reyes", "Ana-Maria Reyes"],
    ["mcdonald's", "Mcdonald's"],
    ["McDonald's", "McDonald's"],
    ["SM supermalls", "SM Supermalls"],
    ["LBC express", "LBC Express"],
    ["jose rizal jr.", "Jose Rizal Jr."],
    ["7-eleven", "7-eleven"],
    ["buying department", "Buying Department"],
    ["MARKETING AND SALES", "Marketing and Sales"],
    ["", ""],
  ])("%s -> %s", (input, expected) => expect(titleCase(input)).toBe(expected));
});

describe("sentenceCase", () => {
  it.each([
    ["gas for the van", "Gas for the van"],
    ["GAS FOR THE VAN", "Gas for the van"],
    ["Gas for the Van", "Gas for the Van"],
    ["grab to makati. return trip", "Grab to makati. Return trip"],
    ["toll fee via NLEX", "Toll fee via NLEX"],
    ["TIN needed for ID", "TIN needed for ID"],
    ["  load   for 3 phones ", "Load for 3 phones"],
    ["ordered iPhone case", "Ordered iPhone case"],
  ])("%s -> %s", (input, expected) => expect(sentenceCase(input)).toBe(expected));
});

it("plates are capitals", () => expect(plateCase(" abc 1234 ")).toBe("ABC 1234"));
