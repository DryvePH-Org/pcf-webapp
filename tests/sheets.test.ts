import { stableJson } from '@/lib/sheets/serialization';
import { describe,it,expect } from 'vitest';
import { parseExpenseRows } from '@/lib/sheets/parser';
import { planExpenses,findLedgerBoundary } from '@/lib/sheets/planner';
import { planRollover } from '@/lib/sheets/rollover';
import type { Cell } from '@/lib/sheets/types';
const s=(value:string):Cell=>({userEnteredValue:{stringValue:value}});
const n=(value:number):Cell=>({userEnteredValue:{numberValue:value},effectiveValue:{numberValue:value}});
const grid:Cell[][]=[[],[],[],[],['#','TAG','PCF#','DATE','PARTICULAR','PLATE','POINT PERSON','COMPANY / PAYEE','SI/OR#','TIN NUMBER','INPUT VAT','IN','OUT','BALANCE'].map(s),[s('BEGINNING BALANCE')],[s('REPLENISHMENT #1')],[n(1),s('CE - FUEL'),s('V-1'),n(46300),s('Fuel'),s('ABC123'),s('Employee'),s('Supplier'),s('R-1'),s(''),{},n(0),n(100),n(900)],[],[...Array.from({length:12},()=>({})),s('TOTAL DISBURSEMENTS')]];
const item={id:'line',expense_date:'2026-11-01',particulars:'Parking',amount:50,category:'CE - PARKING AND TOLL',person:'Employee',supplier:'Parking',plate:'ABC123',receipt_number:'R-2',tin:'',address:'',voucher:'V-2',company:'MAD'};
describe('sheet import and planning safeguards',()=>{
 it('imports expense rows with provenance but skips balances and totals',()=>{const rows=parseExpenseRows('operations',7,'PCF #1',grid);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({voucher:'V-1',amount:100,source_row:8,supplier:'Supplier'});});
 it('does not interpret formulas or summary labels as independent expenses',()=>{const copied=structuredClone(grid);copied[7][12]={userEnteredValue:{formulaValue:'=SUM(A1:A2)'},effectiveValue:{numberValue:100}};expect(parseExpenseRows('operations',7,'PCF #1',copied)).toEqual([]);});
 it('uses explicit strings, correct date serials, and never writes VAT',()=>{const requests=planExpenses(7,grid,[{...item,particulars:'=IMPORTXML("x")'}]);const edits=requests.flatMap(r=>'updateCells' in r?[r.updateCells as {start:{columnIndex:number};rows:{values:Cell[]}[]}]:[]);expect(edits.every(e=>e.start.columnIndex!==10)).toBe(true);expect(edits.some(e=>e.rows[0].values[0].userEnteredValue?.formulaValue?.includes('IMPORTXML'))).toBe(false);expect(edits.some(e=>e.rows[0].values[0].userEnteredValue?.stringValue?.startsWith('=IMPORTXML'))).toBe(true);});
 it('rejects unknown template boundaries and nonempty VAT on the final row',()=>{expect(()=>planExpenses(7,[],[item])).toThrow(/headers/);const copied=structuredClone(grid);copied[8][10]=n(12);expect(()=>planExpenses(7,copied,[item])).toThrow(/VAT/);});
 it('rejects tags that would be missed by the sheet account summaries',()=>{const copied=structuredClone(grid);copied.push([{userEnteredValue:{formulaValue:'=SUMIF(B8:B20,"CE - FUEL",M8:M20)'}}]);expect(()=>planExpenses(7,copied,[item])).toThrow(/does not match/);});
 it('does not guess rollover numbering from another sequence',()=>{const copied=structuredClone(grid);copied[8][13]=n(900);const source={sheetId:7,title:'PCF LEO REPLENISHMENT #5',gridProperties:{rowCount:100,columnCount:20}};const other={...source,sheetId:8,title:'PCF REPLENISHMENT #14'};const plan=planRollover(source,9,[source,other],copied,100,'2026-11-07');expect(plan.number).toBe(6);expect(plan.title).toBe('PCF LEO REPLENISHMENT #6');expect(plan.openingBalance).toBe(900);});
 it('rejects rollover when the template has broken references',()=>{const copied=structuredClone(grid);copied.push([{userEnteredValue:{formulaValue:'#REF!-A1'}}]);expect(()=>planRollover({sheetId:7,title:'PCF #1',gridProperties:{rowCount:100,columnCount:20}},9,[],copied,100,'2026-11-07')).toThrow(/broken/);});
});

describe('Google operation payload identity',()=>{
 it('survives jsonb object-key reordering without changing array order',()=>{
  const initial={requests:[{updateCells:{start:{sheetId:7,rowIndex:8,columnIndex:5},rows:[{values:[{userEnteredValue:{stringValue:'E2E'}}]}],fields:'userEnteredValue'}}]};
  function jsonb(value:unknown):unknown {if(Array.isArray(value))return value.map(jsonb);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.length-b.length||a.localeCompare(b)).map(([k,v])=>[k,jsonb(v)]));return value;}
  const stored=jsonb(initial);expect(JSON.stringify(initial)).not.toBe(JSON.stringify(stored));expect(stableJson(initial)).toBe(stableJson(stored));expect(stableJson([1,2])).not.toBe(stableJson([2,1]));
 });
});

describe('workbook-specific ledger boundaries',()=>{
 it('accepts the singular Selling subtotal label',()=>{const rows=structuredClone(grid);rows[9][12]=s('TOTAL DISBURSEMENT');expect(findLedgerBoundary(rows,4,12)).toBe(9);});
 it('finds an unlabeled Dryve subtotal before its later cash summary',()=>{const rows=structuredClone(grid);rows[9][12]={userEnteredValue:{formulaValue:'=SUM(M6:M9)'}};rows.push([s('TOTAL DISBURSEMENT')]);expect(findLedgerBoundary(rows,4,12)).toBe(9);});
 it('retains manually recorded outstanding advances when opening a new worksheet',()=>{const rows=structuredClone(grid);rows[8][13]=n(900);rows.push([s('UNLIQUIDATED VOUCHER'),n(200)]);const source={sheetId:7,title:'PCF REPLENISHMENT #1',gridProperties:{rowCount:100,columnCount:20}};const plan=planRollover(source,9,[source],rows,100,'2026-11-07');expect(plan.requests.some(r=>{const edit=r.updateCells as {start?:{rowIndex:number;columnIndex:number};rows?:{values:Cell[]}[]}|undefined;return edit?.start?.rowIndex===10&&edit.start.columnIndex===1&&edit.rows?.[0].values[0].userEnteredValue?.numberValue===200;})).toBe(true);});
});
