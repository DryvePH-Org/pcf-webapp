import 'server-only';
import { randomInt } from 'node:crypto';
import { sheetsAdmin,sheetsBridge,type Catalog,type ReadResult } from './bridge';
import { planRollover } from './rollover';
import type { Cell } from './types';
import type { Json } from '@/lib/database.types';
export async function syncSheetRollover(replenishmentId:string) {
 const db=sheetsAdmin();const job=await db.from('sheet_rollovers').select('*').eq('replenishment_id',replenishmentId).single();if(job.error||!job.data||job.data.status==='synced')return;
 const j=job.data;
 try {
  if(!j.book_id)throw new Error('Assign the requesting custodian and fund to a workbook before completing this sheet rollover.');
  const w=await db.from('sheet_workbooks').select('*').eq('id',j.book_id).single();if(w.error||w.data.active_sheet_id===null)throw new Error('Active worksheet is not configured.');
  const r=await db.from('replenishments').select('*').eq('id',replenishmentId).single();if(r.error||r.data.status!=='closed')throw new Error('Confirm the replenishment was received first.');
  const pending=await db.from('sheet_jobs').select('id').eq('book_id',j.book_id).eq('status','pending').limit(1);if(pending.error||pending.data?.length)throw new Error('Deliver pending liquidation updates to the current worksheet before opening the next cycle.');
  const old=await sheetsBridge<{receipt:Json|null}>({action:'status',book:j.book_id,operationId:j.operation_id});
  let requests=j.requests;let target=j.target_sheet_id;let title=j.target_name;
  if(!old.receipt&&!requests){
   const catalog=await sheetsBridge<Catalog>({action:'catalog'});const tabs=catalog.books.find(b=>b.key===j.book_id)?.tabs??[];const source=tabs.find(t=>t.sheetId===w.data.active_sheet_id);if(!source)throw new Error('Active worksheet is missing.');
   const rows:Cell[][]=[];let cursor:number|null=0;const merges:Record<string,unknown>[]=[];
   while(cursor!==null){const response:ReadResult=await sheetsBridge<ReadResult>({action:'read',book:j.book_id,sheetId:source.sheetId,startRow:cursor,limit:500});for(const s of response.snapshot.data.sheets??[]){if(cursor===0)merges.push(...((s as typeof s & {merges?:Record<string,unknown>[]}).merges??[]));for(const b of s.data??[])for(const [i,row] of (b.rowData??[]).entries())rows[(b.startRow??cursor)+i]=row.values??[];}const next:number|null=response.snapshot.nextRow;if(next!==null&&next<=cursor)throw new Error('Invalid pagination');cursor=next;}
   const nextId=randomInt(100000,2000000000);const plan=planRollover(source,nextId,tabs,Array.from({length:rows.length},(_,i)=>rows[i]??[]),Number(r.data.total),new Date(Date.parse(j.created_at)+8*3600000).toISOString().slice(0,10));
   plan.requests.push(...merges.map(range=>({mergeCells:{range:{...range,sheetId:nextId},mergeType:'MERGE_ALL'}})));
   requests=plan.requests as Json;target=nextId;title=plan.title;
   const saved=await db.from('sheet_rollovers').update({requests,target_sheet_id:target,target_name:title}).eq('id',j.id).is('requests',null).select('id');if(saved.error||!saved.data?.length)return;
  }
  let report=old.receipt;
  if(!report){const preview=await sheetsBridge<{preview:{token:string}}>({action:'preview',book:j.book_id,operationId:j.operation_id,requests});const result=await sheetsBridge<{report:Json}>({action:'commit',book:j.book_id,operationId:j.operation_id,requests,token:preview.preview.token});report=result.report;}
  if(target===null)throw new Error('Reconcile the completed rollover target before continuing.');
  const catalog=await sheetsBridge<Catalog>({action:'catalog'});const tabs=catalog.books.find(b=>b.key===j.book_id)?.tabs??[];
  const updated=await db.from('sheet_workbooks').update({active_sheet_id:target,catalog:tabs as unknown as Json,config_version:w.data.config_version+1}).eq('id',w.data.id).eq('config_version',w.data.config_version).select('id');
  if(updated.error||!updated.data?.length)throw new Error('Worksheet created. Assignment reconciliation is pending.');
  await db.from('sheet_rollovers').update({status:'synced',report,error:null}).eq('id',j.id);
 }catch(error){await db.from('sheet_rollovers').update({error:error instanceof Error?error.message:'Rollover pending'}).eq('id',j.id);}
}
