import Link from 'next/link';
import { RolloverRetry } from '@/components/sheets/rollover-retry';
import { requireUser } from '@/lib/auth';
import { sheetsAdmin } from '@/lib/sheets/bridge';
import type { SheetTab } from '@/lib/sheets/types';
import { PageHeader } from '@/components/layout/page-header';
import { SheetsRefresh } from '@/components/sheets/refresh-control';
import { PrintButton } from '@/components/layout/print-button';
import { CsvExportButton } from '@/components/shared/csv-export-button';
import { formatPHP } from '@/lib/money';
import { monthStartInAppTz,todayInAppTz } from '@/lib/dates';
export default async function AccountingPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
 const user=await requireUser('/accounting');const p=await searchParams;const db=sheetsAdmin();
 const {data:books,error:bookError}=await db.from('sheet_workbooks').select('*').order('name');if(bookError)throw new Error(bookError.message);
 const {data:rollovers}=await db.from('sheet_rollovers').select('*').eq('status','pending').order('created_at').limit(20);
 const all=p.history==='all';const from=p.from||(all?'':monthStartInAppTz()),to=p.to||(all?'':todayInAppTz());
 let query=db.from('sheet_expenses').select('*',{count:'exact'});
 if(p.book)query=query.eq('book_id',p.book);if(p.tab&&/^\d+$/.test(p.tab))query=query.eq('sheet_id',Number(p.tab));
 if(/^\d{4}-\d{2}-\d{2}$/.test(from))query=query.gte('expense_date',from);if(/^\d{4}-\d{2}-\d{2}$/.test(to))query=query.lte('expense_date',to);
 for(const key of ['person','category','company','supplier'] as const)if(p[key])query=query.eq(key,p[key]!.slice(0,150));
 const q=(p.q??'').replace(/[^\p{L}\p{N} .-]/gu,'').slice(0,100);
 if(q)query=query.or(['particulars','voucher','person','supplier','plate','receipt_number'].map(c=>`${c}.ilike.%${q}%`).join(','));
 const page=Math.max(1,Math.min(10000,Number(p.page)||1));
 const {data:rows,count,error}=await query.order('expense_date',{ascending:false,nullsFirst:false}).order('book_id').order('sheet_id').order('source_row').range((page-1)*50,page*50-1);if(error)throw new Error(error.message);
 const byId=new Map((books??[]).map(b=>[b.id,b]));const selected=byId.get(p.book??'');
 const url=(n:number)=>{const params=new URLSearchParams(Object.entries(p).filter((e):e is [string,string]=>typeof e[1]==='string'));params.set('page',String(n));return '?'+params;};
 return <div className="space-y-6"><PageHeader title="Accounting · Google Sheets" description="Historical and recent sheet expenses. Sheet edits refresh this view; app cash balances are managed separately." actions={<><PrintButton/>{user.role==='admin'?<Link className="underline" href="/admin/sheets">Workbook assignments</Link>:null}</>}/>
 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(books??[]).map(b=><section key={b.id} className="rounded-xl border p-4"><h2 className="font-semibold">{b.name}</h2><p className="text-xs text-muted-foreground">Last synced: {b.last_synced_at?new Date(b.last_synced_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'Not imported yet'}{b.refresh_until&&new Date(b.refresh_until)>new Date()?' · Refreshing…':''}</p>{b.sync_error?<p className="text-sm text-destructive">{b.sync_error}</p>:null}<a className="text-sm underline" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${b.spreadsheet_id}/edit${b.active_sheet_id!==null?'#gid='+b.active_sheet_id:''}`}>Open in Google Sheets</a></section>)}</div>
 <SheetsRefresh book={p.book}/>
 {rollovers?.length?<section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Pending replenishment worksheets</h2>{rollovers.map(r=><div key={r.id} className="space-y-2"><Link className="underline" href={`/replenishments/${r.replenishment_id}`}>View replenishment</Link><p>{r.target_name??"Worksheet creation pending"} · {r.error??"Waiting for Google Sheets"}</p><RolloverRetry id={r.replenishment_id}/></div>)}</section>:null}
 <form className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
 <label className="text-sm">Search<input name="q" defaultValue={p.q} placeholder="Voucher, person, supplier, plate…" className="mt-1 min-h-11 w-full rounded border bg-background px-2"/></label>
 <label className="text-sm">Workbook<select name="book" defaultValue={p.book??''} className="mt-1 min-h-11 w-full rounded border bg-background px-2"><option value="">All workbooks</option>{books?.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
 <label className="text-sm">Period<select name="history" defaultValue={p.history??'recent'} className="mt-1 min-h-11 w-full rounded border bg-background px-2"><option value="recent">Current month / selected dates</option><option value="all">All history</option></select></label>
 <label className="text-sm">Worksheet<select name="tab" defaultValue={p.tab??''} className="mt-1 min-h-11 w-full rounded border bg-background px-2"><option value="">All worksheets</option>{(selected?.catalog as unknown as SheetTab[]??[]).map(t=><option key={t.sheetId} value={t.sheetId}>{t.title}</option>)}</select></label>
 {(['from','to'] as const).map(key=><label key={key} className="text-sm">{key==='from'?'From':'Through'}<input type="date" name={key} defaultValue={p[key]??''} className="mt-1 min-h-11 w-full rounded border bg-background px-2"/></label>)}
 {['person','category','company','supplier'].map(key=><label key={key} className="text-sm capitalize">{key}<input name={key} defaultValue={p[key]} placeholder="Exact name, or use Search" className="mt-1 min-h-11 w-full rounded border bg-background px-2"/></label>)}
 <button className="min-h-11 rounded border px-4">Apply filters</button><Link className="self-center underline" href="/accounting">Reset filters</Link></form>
 <div className="flex flex-wrap items-center justify-between gap-3"><p>{count??0} matching expense rows · page {page}</p><CsvExportButton filename="accounting-sheet-expenses.csv" label="Export this page" header={['Workbook','Worksheet','Date','Voucher','Category','Particulars','Person','Supplier','Plate','Receipt','Amount']} rows={(rows??[]).map(r=>[byId.get(r.book_id)?.name??r.book_id,r.sheet_name,r.expense_date??'',r.voucher,r.category,r.particulars,r.person,r.supplier,r.plate,r.receipt_number,r.amount])}/></div>
 <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead><tr>{['Source','Expense date','Voucher / person','Particulars','Category / supplier','Amount'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows?.map(r=><tr key={`${r.book_id}:${r.sheet_id}:${r.source_row}`} className="border-t"><td className="p-3"><a className="underline" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${byId.get(r.book_id)?.spreadsheet_id}/edit#gid=${r.sheet_id}&range=A${r.source_row}`}>{byId.get(r.book_id)?.name}<br/>{r.sheet_name} · row {r.source_row}</a></td><td className="p-3 whitespace-nowrap">{r.expense_date??'Date not identified'}</td><td className="p-3">{r.voucher}<br/>{r.person}</td><td className="min-w-56 p-3 whitespace-pre-wrap">{r.particulars}<br/><span className="text-muted-foreground">{r.plate} {r.receipt_number}</span></td><td className="p-3">{r.category}<br/>{r.supplier}</td><td className="p-3 whitespace-nowrap">{formatPHP(r.amount)}</td></tr>)}</tbody></table>{!rows?.length?<p className="p-6 text-muted-foreground">No matching expenses. Refresh a workbook or choose All history.</p>:null}</div>
 <p className="text-xs text-muted-foreground">Historical worksheets may overlap. Totals here describe the displayed source rows, not reconciled fund cash.</p><p className="text-sm">Expense total on this page: {formatPHP((rows??[]).reduce((s,r)=>s+Number(r.amount),0))}</p><div className="flex justify-between">{page>1?<Link className="underline" href={url(page-1)}>Previous</Link>:<span/>}{page*50<(count??0)?<Link className="underline" href={url(page+1)}>Next</Link>:null}</div></div>;
}
