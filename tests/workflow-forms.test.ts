import { createElement } from "react";
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LiquidationForm } from "@/components/liquidations/liquidation-form";
import { CustodianReceiptReview } from "@/components/liquidations/custodian-receipt-review";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn()})}));
vi.mock("@/actions/liquidations",()=>({saveLiquidation:vi.fn()}));
vi.mock("@/actions/custodian-receipts",()=>({saveCustodianReceipts:vi.fn(),extractCustodianReceipt:vi.fn()}));
vi.mock("@/actions/sheet-approval",()=>({previewSheetApproval:vi.fn(),confirmSheetApproval:vi.fn()}));
const id="91000000-0000-4000-8000-000000000001";
it("locks requester identity and filing date and keeps encoding fields in custodian review",()=>{
 const html=renderToStaticMarkup(createElement(LiquidationForm,{employeeName:"Account Employee",received:"500.00",initial:{id,department:"Operations",filing_date:"2026-11-09",unspent_reason:"",items:[{id,particulars:"Fuel",amount:"450",receipt_path:"",no_receipt_reason:""}]}}));
 expect(html).toMatch(/<input(?=[^>]*id="liquidation-name")(?=[^>]*readonly)[^>]*>/i);
 expect(html).toContain("Nov 9, 2026");
 expect(html).not.toContain('type="date"');
 expect(html).toContain('image/heic');
 expect(html).toContain('up to 20 MB');
 expect(html).toContain('Amount received');
 expect(html).toContain('Amount to return');
 expect(html).not.toContain('Supplier TIN');
 expect(html).not.toContain('Workbook tag');
});
it("requires saving changed receipt review before previewing approval",()=>{
 const html=renderToStaticMarkup(createElement(CustodianReceiptReview,{id,revision:0,initial:[{id,particulars:"Fuel",amount:"450",supplier:"Supplier",tin:"NON VAT",tag:"CE - FUEL",expense_date:"2026-11-09",plate:"ABC123",receipt_number:"123",receipt_path:`${id}/line/receipt.jpg`,physical_checked:false}],tags:['CE - FUEL'],total:500,filingDate:"2026-11-09",urls:{},aiReady:false,reviewSaved:false}));
 expect(html).toContain('I verified the receipt and expense details.');
 expect(html).toContain('Supplier TIN or NON VAT');
 expect(html).toMatch(/<button(?=[^>]*disabled)[^>]*>Save receipt review<\/button>/);
 expect(html).not.toContain('Approve and update Google Sheets');
});
