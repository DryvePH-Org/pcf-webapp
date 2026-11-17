import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MoneyTrailPanel } from "@/components/dashboard/money-trail-panel";
import { buildMoneyTrail } from "@/lib/money-trail";

const vouchers = [
  { id: "a", pcv_number: "PCV-2026-0006", payee: "Employee A", amount: 2500 },
  { id: "b", pcv_number: "PCV-2026-0010", payee: "Employee A", amount: 1000 },
  { id: "c", pcv_number: "PCV-2026-0001", payee: "Employee B", amount: 1400 },
];
const liquidations = [
  { voucher_id: "a", status: "approved", total_spent: 4315 },
  { voucher_id: "c", status: "approved", total_spent: 1400 },
];
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the money trail panel", () => {
  it("lists the people and references behind each difference, in plain words", () => {
    const trail = buildMoneyTrail({ fundAmount: 10000, vouchers, liquidations, settlements: [], sheet: { balance: 10000 - 5715, syncedAt: "2026-11-17T01:00:00Z" } });
    const out = text(renderToStaticMarkup(<MoneyTrailPanel trail={trail} />));
    expect(out).toContain("Where is the money?");
    expect(out).toContain("PCV-2026-0006");
    expect(out).toContain("PCV-2026-0010");
    expect(out).toContain("It matches what it should show");
    expect(out).toContain("Why the app and the sheet differ");
  });

  it("says they agree when nothing is pending", () => {
    const trail = buildMoneyTrail({ fundAmount: 5000, vouchers: [], liquidations: [], settlements: [], sheet: null });
    const out = text(renderToStaticMarkup(<MoneyTrailPanel trail={trail} />));
    expect(out).toContain("They agree");
    expect(out).toContain("no Google Sheet connected");
  });
});
