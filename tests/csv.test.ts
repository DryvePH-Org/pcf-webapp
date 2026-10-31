import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("joins header and rows with CRLF", () => {
    const csv = toCsv(["Name", "Amount"], [["Office Supplies", 100.5]]);
    expect(csv).toBe("Name,Amount\r\nOffice Supplies,100.5");
  });

  it("quotes and escapes fields containing commas, quotes, or newlines", () => {
    const csv = toCsv(["Note"], [['Said "hello", then left\nnext line']]);
    expect(csv).toBe('Note\r\n"Said ""hello"", then left\nnext line"');
  });

  it("keeps numeric amounts as plain numbers", () => {
    const csv = toCsv(["Amount"], [[1000], [0.5]]);
    expect(csv).toBe("Amount\r\n1000\r\n0.5");
  });
});
