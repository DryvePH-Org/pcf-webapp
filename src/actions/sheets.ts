'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { SheetsDatabase } from '@/lib/sheets/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { safeDbMessage } from '@/lib/db-error';
const assignment=z.object({id:z.enum(['operations','buying','selling','lmr','dryve']),custodian:z.uuid().nullable(),fund:z.uuid().nullable(),sheet:z.number().int().nonnegative().nullable(),enabled:z.boolean()});
export async function configureWorkbook(input:z.input<typeof assignment>) {
 if(!await getAdminUser())return {ok:false,error:'Administrator access required.'};
 const parsed=assignment.safeParse(input);if(!parsed.success)return {ok:false,error:'Check the assignment.'};
 const v=parsed.data;const db=await createClient() as unknown as SupabaseClient<SheetsDatabase>;
 const {error}=await db.rpc('configure_sheet_workbook',{p_id:v.id,p_custodian:v.custodian,p_fund:v.fund,p_sheet:v.sheet,p_enabled:v.enabled});
 if(error)return {ok:false,error:safeDbMessage(error)};
 revalidatePath('/admin/sheets');revalidatePath('/accounting');return {ok:true};
}
export async function retrySheetRollover(replenishmentId:string) {
 const {getCurrentUser}=await import('@/lib/auth');const user=await getCurrentUser();
 if(!user||!['admin','accounting'].includes(user.role)||!z.uuid().safeParse(replenishmentId).success)return {ok:false,error:'Accounting access required.'};
 const {syncSheetRollover}=await import('@/lib/sheets/sync-rollover');await syncSheetRollover(replenishmentId);revalidatePath('/accounting');return {ok:true};
}
