import type { Cell, SheetExpense } from './types';
const cellText=(c?:Cell)=>String(c?.effectiveValue?.stringValue??c?.userEnteredValue?.stringValue??c?.formattedValue??c?.effectiveValue?.numberValue??c?.userEnteredValue?.numberValue??'').trim();
const numeric=(c?:Cell)=>c?.effectiveValue?.numberValue??c?.userEnteredValue?.numberValue;
export function parseExpenseRows(book:string,sheetId:number,title:string,rows:Cell[][]): SheetExpense[] {
 const header=rows.findIndex(r=>r.some(c=>cellText(c).toUpperCase()==='DATE')&&r.some(c=>cellText(c).toUpperCase()==='OUT'));
 if(header<0)return [];
 const names=rows[header].map(c=>cellText(c).toUpperCase());
 const col=(...labels:string[])=>names.findIndex(n=>labels.includes(n));
 const date=col('DATE'), out=col('OUT'), particulars=col('PARTICULAR','PARTICULARS'),category=col('TAG','EXPENSE TYPE');
 if(particulars<0||out<0||category<0)return [];
 const value=(r:Cell[],...labels:string[])=>cellText(r[col(...labels)]);
 return rows.flatMap((r,index)=>{
  if(index<=header)return [];
  const amount=numeric(r[out]),detail=cellText(r[particulars]),tag=cellText(r[category]);
  if(amount===undefined||!Number.isFinite(amount)||amount<=0||!detail||!tag||r[out]?.userEnteredValue?.formulaValue)return [];
  const serial=numeric(r[date]); let expenseDate:string|null=null;
  if(serial!==undefined&&serial>30000&&serial<80000)expenseDate=new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000).toISOString().slice(0,10);
  return [{book_id:book,sheet_id:sheetId,sheet_name:title,source_row:index+1,expense_date:expenseDate,amount:Math.round(amount*100)/100,particulars:detail,category:tag,
   voucher:value(r,'PCF#','PCF VOUCHER #'),person:value(r,'POINT PERSON'),supplier:value(r,'COMPANY / PAYEE','PAYEE/COMPANY'),plate:value(r,'PLATE','PLATE#'),receipt_number:value(r,'SI/OR#','SI#'),company:value(r,'COMPANY')|| (book==='dryve'?'DRYVE':'MAD')}];
 });
}
