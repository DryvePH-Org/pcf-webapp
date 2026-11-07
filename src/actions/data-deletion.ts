'use server';
import { createClient as rawClient } from '@supabase/supabase-js';
import { getAdminUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { deletionFilters, type DeletionPreview } from '@/lib/deletion';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { safeDbMessage } from '@/lib/db-error';

export async function previewDeletion(input:unknown):Promise<{ok:true;preview:DeletionPreview}|{ok:false;error:string}> {
 if(!await getAdminUser())return {ok:false,error:'Administrator access required.'};
 const parsed=deletionFilters.safeParse(input);if(!parsed.success)return {ok:false,error:parsed.error.issues[0].message};
 const db=await createClient();
 // New migration RPCs are deliberately isolated until generated database types refresh.
 const {data,error}=await db.rpc('prepare_data_deletion' as never,{p:parsed.data} as never);
 if(error)return {ok:false,error:safeDbMessage(error)};
 return {ok:true,preview:data as unknown as DeletionPreview};
}
export async function retryDeletionFiles():Promise<{ok:boolean;message:string}> {
 if(!await getAdminUser())return {ok:false,message:'Administrator access required.'};
 const db=rawClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 // Durable queue: a failed storage request never loses the paths needed for retry.
 const {data,error}=await db.from('deletion_files').select('bucket,path').limit(500);
 if(error)return {ok:false,message:'Could not read pending file cleanup.'};
 let removed=0;
 for(const bucket of ['receipts','liquidation-receipts']) {
  const paths=(data??[]).filter(x=>x.bucket===bucket).map(x=>x.path);
  if(!paths.length)continue;
  const result=await db.storage.from(bucket).remove(paths);
  if(result.error)return {ok:false,message:'Record deletion is saved. File cleanup is pending; retry cleanup.'};
  const cleared=await db.from('deletion_files').delete().eq('bucket',bucket).in('path',paths);
  if(cleared.error)return {ok:false,message:'Files removed; cleanup receipt pending. Retry cleanup safely.'};
  removed+=paths.length;
 }
 const remaining=await db.from('deletion_files').select('*',{head:true,count:'exact'});
 return {ok:true,message:`Removed ${removed} files. ${remaining.count??0} files pending cleanup.`};
}
export async function executeDeletion(id:string,confirmation:string) {
 if(!await getAdminUser())return {ok:false,message:'Administrator access required.'};
 if(!z.uuid().safeParse(id).success)return {ok:false,message:'Invalid preview.'};
 const db=await createClient();
 const {error}=await db.rpc('execute_data_deletion' as never,{p_id:id,p_confirmation:confirmation} as never);
 if(error)return {ok:false,message:safeDbMessage(error)};
 const cleanup=await retryDeletionFiles();
 revalidatePath('/','layout');
 return {ok:true,message:`Deletion completed. ${cleanup.message}`};
}
