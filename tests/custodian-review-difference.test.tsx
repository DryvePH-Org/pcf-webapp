import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("@/actions/custodian-receipts", () => ({ saveCustodianReceipts: vi.fn(), extractCustodianReceipt: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/sheets/approval-control", () => ({ SheetApprovalControl: () => null }));
vi.mock("@/components/liquidations/database-approval-control", () => ({ DatabaseApprovalControl: () => null }));
vi.mock("@/lib/liquidation-receipts", () => ({ uploadLiquidationReceipt: vi.fn() }));

import { CustodianReceiptReview } from "@/components/liquidations/custodian-receipt-review";

const line = (n: number, amount: string) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, particulars: `Line ${n}`, amount, supplier: "", tin: "", tag: "", expense_date: "2026-11-23",
  plate: "", receipt_number: "", company: "", receipt_path: "", physical_checked: false,
});
const props = {
  id: "a8e52739-6b9d-4c74-8886-a8c1cc67603c", revision: 3, tags: [], advance: 7000, filingDate: "2026-11-23", urls: {}, aiReady: false, reviewSaved: false,
  requested: [{ particulars: "Line 1", amount: "750.00" }, { particulars: "Line 2", amount: "2474.00" }],
};

test("a review that differs from the requester names the line and says why approval waits", () => {
  const html = renderToStaticMarkup(<CustodianReceiptReview {...props} total={3224} initial={[line(1, "750.00"), line(2, "2644.00")]} />);
  expect(html).toContain("Line 2: requester reported");
  expect(html).toContain("₱2,474.00");
  expect(html).toContain("₱2,644.00");
  expect(html).not.toContain("Line 1: requester reported");
  expect(html).toContain("Approval needs the two totals to match");
});

test("a different number of entries is said plainly, and a matching review shows no difference note", () => {
  const more = renderToStaticMarkup(<CustodianReceiptReview {...props} total={3224} initial={[line(1, "750.00"), line(2, "2474.00"), line(3, "10.00")]} />);
  expect(more).toContain("This review has 3 entries, the requester reported 2");
  const same = renderToStaticMarkup(<CustodianReceiptReview {...props} total={3224} initial={[line(1, "750.00"), line(2, "2474.00")]} />);
  expect(same).not.toContain("Approval needs the two totals to match");
});
