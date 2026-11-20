import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { LiquidationPrintSheet } from "@/components/liquidations/liquidation-print-sheet";

test("the paper copy has the summary, the table and every signature line", () => {
  const html = renderToStaticMarkup(
    <LiquidationPrintSheet
      pcv="PCV-2026-0014" fund="Sample Petty Cash Fund" statusLabel="Approved" name="Sample Employee" department="Operations"
      filingDate="2026-11-18" advance={3000} spent={2870.5} settlementLabel="Cash to return" settlementAmount="₱129.50"
      lines={Array.from({ length: 9 }, (_, i) => ({ position: i + 1, particulars: `Sample expense line ${i + 1} with a longer description of the purchase`, amount: 300 + i, receipt: i === 3 ? "None: lost" : "Attached" }))}
      unspentReason={null} filedBy="Sample Custodian" reviewedLine="Sample Custodian, Nov 19, 2026" settlementNote={null}
    />,
  );
  for (const text of ["Filed by:", "Noted by:", "Checked by:", "Approved by:", "Received by:", "Received date:", "Employee&#x27;s printed name and signature", "Immediate supervisor&#x27;s name and signature", "Finance Personnel", "Managing Partners", "Total spent"]) {
    expect(html).toContain(text);
  }
});

test("long text is kept whole: nothing is cut, and wrapping is allowed everywhere", () => {
  const long = "Reimbursement for the team outing ".repeat(12) + "SUPERCALIFRAGILISTICEXPIALIDOCIOUS".repeat(4);
  const html = renderToStaticMarkup(
    <LiquidationPrintSheet
      pcv="PCV-2026-0015" fund={"A fund with a very long name ".repeat(3)} statusLabel="Submitted" name={"A Very Long Name ".repeat(5)} department="Operations"
      filingDate="2026-11-18" advance={100} spent={5000} settlementLabel="Owed to employee" settlementAmount="₱4,900.00"
      lines={Array.from({ length: 35 }, (_, i) => ({ position: i + 1, particulars: long, amount: 100 + i, receipt: "None: " + long }))}
      unspentReason={long} filedBy={null} reviewedLine={long} settlementNote={long}
    />,
  );
  expect(html).toContain(long);
  expect(html.match(/<tr /g)?.length).toBeGreaterThanOrEqual(35);
  expect(html).toContain("overflow-wrap:anywhere");
  expect(html).toContain("table-header-group");
});
