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
