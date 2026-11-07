import 'server-only';
import {stableJson} from './serialization';
import { createClient } from '@supabase/supabase-js';
import type { SheetsDatabase, SheetTab, Grid } from './types';
export function sheetsAdmin() {
 return createClient<SheetsDatabase>(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function sheetsBridge<T>(body: Record<string,unknown>): Promise<T> {
 const url=process.env.GOOGLE_SHEETS_SCRIPT_URL, secret=process.env.GOOGLE_SHEETS_SCRIPT_SECRET;
 if(!url||!secret) throw new Error('Google Sheets connection is not configured.');
 const target=new URL(url); if(target.protocol!=='https:'||target.hostname!=='script.google.com'||!target.pathname.endsWith('/exec'))throw new Error('Invalid Google deployment URL.');
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:stableJson({...body,secret}),signal:AbortSignal.timeout(60000),cache:'no-store'});
 if(!response.ok)throw new Error('Google Sheets is temporarily unavailable.');
 const data=await response.json(); if(!data.ok)throw new Error(`Google Sheets: ${String(data.error??'request failed')}`);
 return data as T;
}
export type Catalog = { books: {key:string;id:string;title:string;tabs:SheetTab[]}[];writesEnabled:boolean };
export type ReadResult = {snapshot:{nextRow:number|null;data:{sheets:{properties:SheetTab;data:Grid[]}[]}}};
