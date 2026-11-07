import type {Cell,SheetTab} from './types';
import type {SheetRequest} from './planner';
export function planRollover(source:SheetTab,newId:number,tabs:SheetTab[],grid:Cell[][],amount:number,receivedDate:string) {
 const cell=(c?:Cell)=>String(c?.userEnteredValue?.stringValue??c?.formattedValue??'').trim().toUpperCase();
 const header=grid.findIndex(r=>r.some(c=>cell(c)==='DATE')&&r.some(c=>cell(c)==='OUT'));
 const total=grid.findIndex((r,i)=>i>header&&r.some(c=>cell(c)==='TOTAL DISBURSEMENTS'));
 if(header<0||total<header+3)throw new Error('Rollover template boundaries are not recognized.');
 if(grid.some(r=>r.some(c=>c.userEnteredValue?.formulaValue?.includes('#REF!'))))throw new Error('The template contains broken formula references. Correct it in Google Sheets and refresh before rollover.');
 const match=source.title.match(/^(.*?#)\s*(\d+)(.*)$/i);if(!match)throw new Error('The current worksheet numbering is not recognized.');
 const prefix=match[1];const numbers=tabs.flatMap(t=>{const m=t.title.match(/^(.*?#)\s*(\d+)(.*)$/);return m&&m[1].toUpperCase()===prefix.toUpperCase()?[Number(m[2])]:[];});
 const number=Math.max(Number(match[2]),...numbers)+1;
 const month=new Date(receivedDate+'T12:00:00Z').toLocaleString('en-US',{month:'long',year:'numeric',timeZone:'Asia/Manila'}).toUpperCase();
 const title=prefix+(match[1].endsWith(' #')?'':'')+(match[0].includes('# ')?' ':'')+number+(match[3].includes('-')?' - '+month:match[3]);
 const headers=grid[header].map(cell);const balance=headers.indexOf('BALANCE'),inflow=headers.indexOf('IN'),out=headers.indexOf('OUT'),vat=headers.indexOf('INPUT VAT');
 if(balance<0||inflow<0)throw new Error('Template cash columns are missing.');
 const opening=grid.findIndex((r,i)=>i>header&&r.some(c=>/^(BEGINNING BALANCE|BALANCE FORWARDED)$/.test(cell(c))));
 const replenish=opening+1;if(opening<0)throw new Error('Template opening balance is missing.');
 const previous=grid[total-1]?.[balance]?.effectiveValue?.numberValue;
 if(previous===undefined||!Number.isFinite(previous))throw new Error('Previous closing sheet balance is unavailable.');
 const rowCount=Math.max(grid.length+10,source.gridProperties.rowCount),columns=Math.min(source.gridProperties.columnCount,52);
 const requests:SheetRequest[]=[{addSheet:{properties:{sheetId:newId,title,gridProperties:{rowCount,columnCount:columns}}}},{copyPaste:{source:{sheetId:source.sheetId,startRowIndex:0,endRowIndex:grid.length,startColumnIndex:0,endColumnIndex:columns},destination:{sheetId:newId,startRowIndex:0,endRowIndex:grid.length,startColumnIndex:0,endColumnIndex:columns},pasteType:'PASTE_FORMAT'}}];
 requests.push({copyPaste:{source:{sheetId:source.sheetId,startRowIndex:0,endRowIndex:grid.length,startColumnIndex:0,endColumnIndex:columns},destination:{sheetId:newId,startRowIndex:0,endRowIndex:grid.length,startColumnIndex:0,endColumnIndex:columns},pasteType:'PASTE_DATA_VALIDATION'}});
 const set=(r:number,c:number,value:NonNullable<Cell['userEnteredValue']>)=>requests.push({updateCells:{start:{sheetId:newId,rowIndex:r,columnIndex:c},rows:[{values:[{userEnteredValue:value}]}],fields:'userEnteredValue'}});
 // Keep headers, summary formulas and sign-off layout. Never copy old expenses or VAT values.
 for(let r=0;r<grid.length;r++)for(let c=0;c<Math.min(grid[r].length,columns);c++) {
  const value=grid[r][c]?.userEnteredValue;if(!value)continue;
  if(c===vat&&r!==header)continue;
  if(r>header&&r<total&&c<=balance)continue;
  if(r>=total&&value.numberValue!==undefined)continue;
  if(r<Math.min(header,4)&&value.stringValue&&/^[A-Z]+ 20\d{2}$/.test(value.stringValue.trim().toUpperCase()))set(r,c,{stringValue:month});else set(r,c,value);
 }
 set(opening,headers.findIndex(h=>h==='DATE')>=0?Math.max(0,grid[opening].findIndex(c=>cell(c)==='BEGINNING BALANCE'||cell(c)==='BALANCE FORWARDED')):0,{stringValue:cell(grid[opening].find(c=>/^(BEGINNING BALANCE|BALANCE FORWARDED)$/.test(cell(c))))});
 set(opening,balance,{numberValue:previous});set(replenish,inflow,{numberValue:amount});
 const labelColumn=grid[replenish].findIndex(c=>/^REPLENISHMENT/.test(cell(c)));if(labelColumn>=0)set(replenish,labelColumn,{stringValue:'REPLENISHMENT #'+number});
 const letter=(c:number)=>{let s='';for(let n=c+1;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
 for(let r=replenish;r<total;r++)set(r,balance,{formulaValue:`=${letter(balance)}${r}+${letter(inflow)}${r+1}-${letter(out)}${r+1}`});
 return {requests,title,newId,number,openingBalance:previous,amount};
}
