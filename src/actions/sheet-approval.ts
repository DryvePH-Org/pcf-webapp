'use server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/database.types';
import { sheetsAdmin,sheetsBridge,type ReadResult } from '@/lib/sheets/bridge';
import { planExpenses,type ExpenseForSheet } from '@/lib/sheets/planner';
import type { SheetsDatabase,Cell,SheetTab } from '@/lib/sheets/types';
import { safeDbMessage } from '@/lib/db-error';
export async function previewSheetApproval(id:string) {
 const user=await getCurrentUser();if(!user||!['custodian','admin'].includes(user.role)||!z.uuid().safeParse(id).success)return {ok:false as const,error:'Custodian access required.'};
 const db=await createClient();const l=await db.from('liquidations').select('*').eq('id',id).single();
 if(l.error||!l.data||l.data.owner_id===user.id)return {ok:false as const,error:'Liquidation unavailable for review.'};
 const admin=sheetsAdmin();const existing=await admin.from('sheet_jobs').select('*').eq('liquidation_id',id).maybeSingle();
 if(l.data.status!=='submitted'&&!(l.data.status==='approved'&&existing.data))return {ok:false as const,error:'Only submitted liquidations or pending sheet updates can be reviewed.'};
 try {
  let configs=admin.from('sheet_workbooks').select('*');
  configs=existing.data?configs.eq('id',existing.data.book_id):configs.eq('custodian_id',user.id).eq('fund_id',l.data.fund_id).eq('enabled',true);
  const w=await configs.single();if(w.error||!w.data||w.data.custodian_id!==user.id||w.data.fund_id!==l.data.fund_id||!w.data.enabled||w.data.active_sheet_id===null)throw new Error('An administrator must assign your workbook, fund, and active worksheet first.');
  if(existing.data){
   const status=await sheetsBridge<{receipt:Json|null}>({action:'status',book:w.data.id,operationId:existing.data.operation_id});
   if(status.receipt){await admin.from('sheet_jobs').update({status:'synced',report:status.receipt,error:null}).eq('id',existing.data.id);return {ok:false as const,error:'Google already applied this update. Refresh to view the saved report.'};}
   const original=await admin.from('sheet_previews').select('sheet_id').eq('id',existing.data.preview_id).single();
   if(original.error||original.data.sheet_id!==w.data.active_sheet_id)throw new Error('The original destination worksheet changed. Ask an administrator to resolve the pending update before retrying.');
  }
  const pendingRollover=await admin.from('sheet_rollovers').select('id').eq('book_id',w.data.id).eq('status','pending').limit(1);
  if(pendingRollover.error)throw new Error('Could not verify worksheet rollover status.');
  if(!existing.data&&pendingRollover.data?.length)throw new Error('Complete the pending replenishment worksheet before synchronizing more expenses.');
  const items=await db.from('liquidation_items').select('*').eq('liquidation_id',id).order('position');const cats=await db.from('categories').select('id,name');
  if(items.error||cats.error)throw new Error('Could not load expenses.');
  const expenses:ExpenseForSheet[]=(items.data??[]).map(item=>{
   const detail=(item as typeof item & {sheet_details?:Record<string,string>}).sheet_details??{};
   if(!detail.expense_date)throw new Error(`Enter the actual expense date for expense ${item.position}. Flag it for correction if needed.`);
   return {id:item.id,expense_date:detail.expense_date,particulars:item.particulars,amount:Number(item.amount),category:detail.sheet_category||(cats.data?.find(c=>c.id===item.category_id)?.name??''),person:l.data.employee_name,supplier:detail.supplier??'',plate:detail.plate??'',receipt_number:detail.receipt_number??'',tin:detail.tin??'',address:detail.address??'',voucher:l.data.pcv_number,company:detail.company||(w.data.id==='dryve'?'DRYVE':'MAD')};
  });
  const rows:Cell[][]=[];let cursor:number|null=0;let offline=false;
  if(expenses.length){try {
   while(cursor!==null){const response:ReadResult=await sheetsBridge<ReadResult>({action:'read',book:w.data.id,sheetId:w.data.active_sheet_id,startRow:cursor,limit:500});for(const sheet of response.snapshot.data.sheets??[])for(const block of sheet.data??[])for(const [i,row] of (block.rowData??[]).entries())rows[(block.startRow??cursor)+i]=row.values??[];const next:number|null=response.snapshot.nextRow;if(next!==null&&next<=cursor)throw new Error('Invalid Google pagination.');cursor=next;}
  }catch{offline=true;}}
  let requests=offline?[]:planExpenses(w.data.active_sheet_id,Array.from({length:rows.length},(_,i)=>rows[i]??[]),expenses);
  const operation=existing.data?.operation_id??`liquidation_${id.replaceAll('-','')}`;
  let google:{preview:{token?:string;alreadyApplied?:boolean;report?:Json}}={preview:{token:offline?'needs-preview':'no-expenses'}};
  if(requests.length){try{google=await sheetsBridge({action:'preview',book:w.data.id,operationId:operation,requests});}catch{offline=true;requests=[];google={preview:{token:'needs-preview'}};}}
  if(google.preview.alreadyApplied&&existing.data){await admin.from('sheet_jobs').update({status:'synced',report:google.preview.report??null,error:null}).eq('id',existing.data.id);return {ok:false as const,error:'This update was already delivered. Refresh to view its report.'};}
  const tab=(w.data.catalog as unknown as SheetTab[]).find(t=>t.sheetId===w.data.active_sheet_id);
  const previewId=randomUUID();const summary={warning:offline?'Google is unavailable. Approval can be recorded; delivery will wait for a fresh preview and confirmation.':'',workbook:w.data.name,worksheet:tab?.title??String(w.data.active_sheet_id),expenses,total:expenses.reduce((s,i)=>s+i.amount,0),url:`https://docs.google.com/spreadsheets/d/${w.data.spreadsheet_id}/edit#gid=${w.data.active_sheet_id}`};
  const saved=await admin.from('sheet_previews').insert({id:previewId,liquidation_id:id,reviewer_id:user.id,revision:l.data.revision,book_id:w.data.id,config_version:w.data.config_version,sheet_id:w.data.active_sheet_id,sheet_name:summary.worksheet,operation_id:operation,requests:requests as Json,google_token:google.preview.token!,summary:summary as unknown as Json,expires_at:new Date(Date.now()+240000).toISOString(),created_at:new Date().toISOString()});
  if(saved.error)throw new Error('Could not save update preview.');
  return {ok:true as const,id:previewId,summary,retry:Boolean(existing.data)};
 }catch(error){return {ok:false as const,error:error instanceof Error?error.message:'Could not prepare the update.'};}
}
export async function confirmSheetApproval(previewId:string) {
 const user=await getCurrentUser();if(!user||!z.uuid().safeParse(previewId).success)return {ok:false,error:'Sign in first.'};
 const admin=sheetsAdmin();const p=await admin.from('sheet_previews').select('*').eq('id',previewId).single();
 if(p.error||p.data.reviewer_id!==user.id||Date.parse(p.data.expires_at)<Date.now())return {ok:false,error:'Preview expired. Review the update again.'};
 const db=await createClient() as unknown as SupabaseClient<SheetsDatabase>;
 let job=await admin.from('sheet_jobs').select('*').eq('liquidation_id',p.data.liquidation_id).maybeSingle();
 if(job.data?.status==='synced')return {ok:true,message:'Already delivered. View the saved report.'};
 if(job.data){
  const w=await admin.from('sheet_workbooks').select('*').eq('id',p.data.book_id).single();
  if(w.error||w.data.custodian_id!==user.id||w.data.config_version!==p.data.config_version||job.data.book_id!==p.data.book_id)return {ok:false,error:'Assignment changed. Review again.'};
  const updated=await admin.from('sheet_jobs').update({preview_id:previewId}).eq('id',job.data.id);if(updated.error)return {ok:false,error:'Could not record retry.'};
 }else{const approval=await db.rpc('approve_liquidation_with_sheet',{p_preview:previewId});if(approval.error)return {ok:false,error:safeDbMessage(approval.error)};job=await admin.from('sheet_jobs').select('*').eq('id',approval.data).single();}
 try{
  if(p.data.google_token==='needs-preview')throw new Error('Google Sheets update is pending a fresh preview. Review and retry when the connection is available.');
  await admin.from('sheet_jobs').update({attempts:(job.data?.attempts??0)+1}).eq('id',job.data!.id);
  const response=p.data.google_token==='no-expenses'?{report:{message:'No expense rows; no Google write required.',completedAt:new Date().toISOString()}}:await sheetsBridge<{report:Json}>({action:'commit',book:p.data.book_id,operationId:p.data.operation_id,token:p.data.google_token,requests:p.data.requests});
  const saved=await admin.from('sheet_jobs').update({status:'synced',report:response.report,error:null,updated_at:new Date().toISOString()}).eq('id',job.data!.id);
  if(saved.error)throw new Error('Google delivery completed; report needs reconciliation.');
  revalidatePath('/liquidations');revalidatePath('/accounting');return {ok:true,message:'Liquidation approved and Google Sheets updated. View the saved update report.'};
 }catch(error){const message=error instanceof Error?error.message:'Delivery unavailable';await admin.from('sheet_jobs').update({status:'pending',error:message,updated_at:new Date().toISOString()}).eq('id',job.data!.id);revalidatePath('/liquidations');return {ok:true,message:'Liquidation approved — sheet update pending. Review and retry the sheet update.'};}
}
