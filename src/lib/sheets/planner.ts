import type { Cell } from './types';
export type ExpenseForSheet = { id:string;expense_date:string;particulars:string;amount:number;category:string;person:string;supplier:string;plate:string;receipt_number:string;tin:string;address:string;voucher:string;company:string };
export type SheetRequest = Record<string,unknown>;
const text=(c?:Cell)=>String(c?.userEnteredValue?.stringValue??c?.formattedValue??'').trim().toUpperCase();
export function planExpenses(sheetId:number,grid:Cell[][],items:ExpenseForSheet[]):SheetRequest[] {
 if(!items.length)return [];
 const h=grid.findIndex(row=>row.some(c=>text(c)==='DATE')&&row.some(c=>text(c)==='OUT'));
 if(h<0)throw new Error('Worksheet expense headers were not recognized.');
 const headers=grid[h].map(text),col=(...names:string[])=>headers.findIndex(n=>names.includes(n));
 const total=grid.findIndex((r,i)=>i>h&&r.some(c=>text(c)==='TOTAL DISBURSEMENTS'));
 if(total<h+3)throw new Error('Worksheet disbursement boundary was not recognized.');
 const balance=col('BALANCE'),inflow=col('IN'),out=col('OUT'),vat=col('INPUT VAT');
 if(balance<0||inflow<0||out<0)throw new Error('Worksheet cash columns were not recognized.');
 const insertion=total-1,tail=grid[insertion]??[];
 if(vat>=0&&tail[vat]?.userEnteredValue)throw new Error('The final ledger row contains VAT. Select a reviewed template before inserting.');
 // Insert within existing sum ranges, preserve the old final ledger row in place,
 // and put the new rows after it. Whole-row insertion expands summary references.
 const requests:SheetRequest[]=[{insertDimension:{range:{sheetId,dimension:'ROWS',startIndex:insertion,endIndex:insertion+items.length},inheritFromBefore:true}}];
 const set=(row:number,column:number,value:NonNullable<Cell['userEnteredValue']>)=>{
  if(column<0||column===vat)return;
  requests.push({updateCells:{start:{sheetId,rowIndex:row,columnIndex:column},rows:[{values:[{userEnteredValue:value}]}],fields:'userEnteredValue'}});
 };
 for(let c=0;c<=balance;c++)if(c!==vat)set(insertion,c,tail[c]?.userEnteredValue??{stringValue:''});
 const letter=(c:number)=>{let s='';for(let n=c+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
 items.forEach((item,index)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(item.expense_date)||!Number.isFinite(item.amount)||item.amount<=0)throw new Error('Expense date and positive amount are required.');
  const row=insertion+index+1;
  requests.push({copyPaste:{source:{sheetId,startRowIndex:insertion,endRowIndex:insertion+1,startColumnIndex:0,endColumnIndex:balance+1},destination:{sheetId,startRowIndex:row,endRowIndex:row+1,startColumnIndex:0,endColumnIndex:balance+1},pasteType:'PASTE_FORMAT'}});
  requests.push({copyPaste:{source:{sheetId,startRowIndex:insertion,endRowIndex:insertion+1,startColumnIndex:0,endColumnIndex:balance+1},destination:{sheetId,startRowIndex:row,endRowIndex:row+1,startColumnIndex:0,endColumnIndex:balance+1},pasteType:'PASTE_DATA_VALIDATION'}});
  const strings:[number,string][]=[[col('TAG','EXPENSE TYPE'),item.category],[col('PARTICULAR','PARTICULARS'),item.particulars],[col('PCF#','PCF VOUCHER #'),item.voucher],[col('POINT PERSON'),item.person],[col('COMPANY / PAYEE','PAYEE/COMPANY'),item.supplier],[col('PLATE','PLATE#'),item.plate],[col('SI/OR#','SI#'),item.receipt_number],[col('TIN','TIN NUMBER'),item.tin],[col('ADDRESS'),item.address],[col('COMPANY'),item.company]];
  for(const [column,value] of strings)set(row,column,{stringValue:value});
  set(row,col('DATE'),{numberValue:Math.round((Date.parse(item.expense_date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000)});
  set(row,out,{numberValue:item.amount});set(row,inflow,{stringValue:''});
  set(row,balance,{formulaValue:`=${letter(balance)}${row}+${letter(inflow)}${row+1}-${letter(out)}${row+1}`});
  const sequence=col('#','NO');if(sequence>=0)set(row,sequence,{formulaValue:`=MAX(${letter(sequence)}$${h+2}:${letter(sequence)}${row})+1`});
 });
 return requests;
}
