import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
const state = { sheets: [{ properties: { sheetId: 7 }, data: [{ rowData: [{ values: [{ userEnteredValue: { stringValue: 'INPUT VAT' } }] }] }] }] };
function sandbox(extra = {}) {
 const context = vm.createContext({ console, Utilities: { DigestAlgorithm: { SHA_256: '' }, Charset: { UTF_8: '' }, computeDigest: (_, text) => [...createHash('sha256').update(text).digest()] }, ...extra });
 new vm.Script(source).runInContext(context); return context;
}
const update = (column) => ({ updateCells: { start: { sheetId: 7, rowIndex: 9, columnIndex: column }, rows: [{ values: [{ userEnteredValue: { numberValue: 100 } }] }], fields: 'userEnteredValue' } });
test('existing VAT column is blocked, adjacent expense values are allowed', () => {
 const c=sandbox(); assert.throws(()=>c.pcfValidate_([update(0)],state),/vat_write_blocked/); c.pcfValidate_([update(1)],state);
});
test('delete and full value copy requests are blocked', () => {
 const c=sandbox(); assert.throws(()=>c.pcfValidate_([{deleteSheet:{sheetId:7}}],state),/unsupported_request/);
 assert.throws(()=>c.pcfValidate_([{copyPaste:{source:{sheetId:7},destination:{sheetId:7},pasteType:'PASTE_NORMAL'}}],state),/unsupported_request/);
});
test('broad update ranges and unknown tabs are blocked', () => {
 const c=sandbox(); const r=update(1); r.updateCells.range={sheetId:7}; assert.throws(()=>c.pcfValidate_([r],state),/invalid_plan/);
 const t=update(1); t.updateCells.start.sheetId=8; assert.throws(()=>c.pcfValidate_([t],state),/invalid_plan/);
});
test('applied operation is returned without a second batch write', () => {
 const c=sandbox({LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})}});
 const requests=[update(1)]; const digest=c.pcfHash_(JSON.stringify(requests));
 c.pcfReceipt_=()=>({digest,operationId:'test_operation_123'});
 assert.equal(c.pcfCommit_('book',{operationId:'test_operation_123',requests}).alreadyApplied,true);
 assert.throws(()=>c.pcfCommit_('book',{operationId:'test_operation_123',requests:[update(2)]}),/operation_conflict/);
});
test('human edits after preview stop the batch', () => {
 const requests=[update(1)]; const c=sandbox({LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})}});
 c.pcfReceipt_=()=>null; c.pcfState_=()=>state;
 c.CacheService={getScriptCache:()=>({get:()=>JSON.stringify({operationId:'test_operation_123',book:'operations',digest:c.pcfHash_(JSON.stringify(requests)),state:'outdated',expires:Date.now()+10000})})};
 assert.throws(()=>c.pcfCommit_('book',{operationId:'test_operation_123',book:'operations',token:'x',requests}),/sheet_changed/);
});
test('bad authentication does not access Sheets', () => {
 const c=sandbox({PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'a'.repeat(64)})}});
 c.pcfReply_=x=>x;
 assert.equal(c.doPost({postData:{contents:JSON.stringify({secret:'wrong',action:'catalog'})}}).error,'unauthorized');
});
test('expired preview cannot apply a new write', () => {
 const c=sandbox({LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},CacheService:{getScriptCache:()=>({get:()=>null})}});
 c.pcfReceipt_=()=>null;
 assert.throws(()=>c.pcfCommit_('book',{operationId:'test_operation_123',requests:[update(1)]}),/preview_expired/);
});
test('snapshot reads only affected used cells in bounded chunks', () => {
 const calls=[];
 const native=(id,rows,columns)=>({getSheetId:()=>id,getLastRow:()=>rows,getLastColumn:()=>columns});
 const c=sandbox({SpreadsheetApp:{openById:()=>({getSheets:()=>[native(7,230,30),native(8,9000,50)]})},Sheets:{Spreadsheets:{get:(_,args)=>{
  calls.push(args);
  if(!args.ranges)return {sheets:[{properties:{sheetId:7,title:"Buyer's tab",gridProperties:{rowCount:10000,columnCount:50}}},{properties:{sheetId:8,title:'History'}}]};
  assert.equal(args.ranges.length,1);
  return {sheets:[{data:[{startRow:0,startColumn:0,rowData:[]}]}]};
 }}}});
 const result=c.pcfState_('book',[update(1)]);
 assert.equal(calls.length,7); // one metadata call + 3 row chunks x 2 column chunks
 assert.ok(calls.slice(1).every(a=>a.ranges[0].startsWith("'Buyer''s tab'!")));
 assert.equal(calls[1].ranges[0],"'Buyer''s tab'!A1:Z100");
 assert.equal(calls.at(-1).ranges[0],"'Buyer''s tab'!AA201:AD230");
 assert.equal(result.sheets[0].data.length,6);
 assert.equal(result.sheets[1].data,undefined);
});
test('VAT headers use absolute row positions across snapshot chunks',()=>{
 const c=sandbox();const chunked={sheets:[{properties:{sheetId:7},data:[{startRow:0,startColumn:0,rowData:[{values:[{userEnteredValue:{stringValue:'DATE'}}]}]},{startRow:100,startColumn:0,rowData:[{values:[{userEnteredValue:{stringValue:'INPUT VAT'}}]}]}]}]};
 c.pcfValidate_([update(0)],chunked);
});
