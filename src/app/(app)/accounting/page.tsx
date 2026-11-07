import Link from 'next/link';
import { RolloverRetry } from '@/components/sheets/rollover-retry';
import { requireUser } from '@/lib/auth';
import { sheetsAdmin } from '@/lib/sheets/bridge';
import type { SheetTab } from '@/lib/sheets/types';
import { PageHeader } from '@/components/layout/page-header';
import { SheetsRefresh } from '@/components/sheets/refresh-control';
import { PrintButton } from '@/components/layout/print-button';
import { CsvExportButton } from '@/components/shared/csv-export-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OptionSelect } from '@/components/shared/option-select';
import { ResponsiveList } from '@/components/shared/responsive-list';
import { MoneyText } from '@/components/shared/money-text';
import { EmptyState } from '@/components/shared/empty-state';
import { Files } from 'lucide-react';
import { formatDateTime } from '@/lib/dates';
import { monthStartInAppTz,todayInAppTz } from '@/lib/dates';
export default async function AccountingPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
 const user=await requireUser('/accounting');const p=await searchParams;const db=sheetsAdmin();
 const {data:books,error:bookError}=await db.from('sheet_workbooks').select('*').order('name');if(bookError)throw new Error(bookError.message);
 const {data:rollovers}=await db.from('sheet_rollovers').select('*').eq('status','pending').order('created_at').limit(20);
 const all=p.history==='all';const from=p.from||(all?'':monthStartInAppTz()),to=p.to||(all?'':todayInAppTz());
 let query=db.from('sheet_expenses').select('*',{count:'exact'});
 if(p.book)query=query.eq('book_id',p.book);if(p.tab&&/^\d+$/.test(p.tab)&&(books?.find(b=>b.id===p.book)?.catalog as unknown as SheetTab[]??[]).some(t=>t.sheetId===Number(p.tab)))query=query.eq('sheet_id',Number(p.tab));
 if(/^\d{4}-\d{2}-\d{2}$/.test(from))query=query.gte('expense_date',from);if(/^\d{4}-\d{2}-\d{2}$/.test(to))query=query.lte('expense_date',to);
 for(const key of ['person','category','company','supplier'] as const)if(p[key])query=query.eq(key,p[key]!.slice(0,150));
 const q=(p.q??'').replace(/[^\p{L}\p{N} .-]/gu,'').slice(0,100);
 if(q)query=query.or(['particulars','voucher','person','supplier','plate','receipt_number'].map(c=>`${c}.ilike.%${q}%`).join(','));
 const page=Math.max(1,Math.min(10000,Number(p.page)||1));
 const {data:rows,count,error}=await query.order('expense_date',{ascending:false,nullsFirst:false}).order('book_id').order('sheet_id').order('source_row').range((page-1)*50,page*50-1);if(error)throw new Error(error.message);
 const byId=new Map((books??[]).map(b=>[b.id,b]));const selected=byId.get(p.book??'');
 const url=(n:number)=>{const params=new URLSearchParams(Object.entries(p).filter((e):e is [string,string]=>typeof e[1]==='string'));params.set('page',String(n));return '?'+params;};
 return <div className="space-y-6"><PageHeader title="Accounting · Google Sheets" description="Historical and recent sheet expenses. Sheet edits refresh this view; app cash balances are managed separately." actions={<><PrintButton/>{user.role==='admin'?<Button variant="outline" nativeButton={false} render={<Link href="/admin/sheets"/>}>Workbook assignments</Button>:null}</>}/>
 <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 print:hidden">{(books??[]).map(b=><Card key={b.id}><CardHeader><CardTitle>{b.name}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">Last synced: {b.last_synced_at?formatDateTime(b.last_synced_at):'Not imported yet'}{b.refresh_until&&new Date(b.refresh_until)>new Date()?' · Refreshing…':''}</p>{b.sync_error?<p className="text-sm text-destructive">{b.sync_error}</p>:null}<Button variant="outline" size="sm" nativeButton={false} render={<a target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${b.spreadsheet_id}/edit${b.active_sheet_id!==null?'#gid='+b.active_sheet_id:''}`} />}>Open in Google Sheets</Button></CardContent></Card>)}</div>
 <SheetsRefresh book={p.book}/>
 {rollovers?.length?<section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Pending replenishment worksheets</h2>{rollovers.map(r=><div key={r.id} className="space-y-2"><Link className="underline" href={`/replenishments/${r.replenishment_id}`}>View replenishment</Link><p>{r.target_name??"Worksheet creation pending"} · {r.error??"Waiting for Google Sheets"}</p><RolloverRetry id={r.replenishment_id}/></div>)}</section>:null}
 <Card className="print:hidden"><CardHeader><CardTitle>Filter expenses</CardTitle></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
 <div className="space-y-2"><Label htmlFor="accounting-search">Search</Label><Input id="accounting-search" name="q" maxLength={100} defaultValue={p.q} placeholder="Voucher, person, supplier, plate…"/></div>
 <div className="min-w-0 space-y-2"><Label htmlFor="accounting-book">Workbook</Label><OptionSelect id="accounting-book" name="book" defaultValue={p.book??''} options={[{value:'',label:'All workbooks'},...(books??[]).map(b=>({value:b.id,label:b.name}))]}/></div>
 <div className="min-w-0 space-y-2"><Label htmlFor="accounting-period">Period</Label><OptionSelect id="accounting-period" name="history" defaultValue={p.history??'recent'} options={[{value:'recent',label:'Current month / selected dates'},{value:'all',label:'All history'}]}/></div>
 <div className="min-w-0 space-y-2"><Label htmlFor="accounting-tab">Worksheet</Label><OptionSelect id="accounting-tab" name="tab" defaultValue={p.tab??''} options={[{value:'',label:'All worksheets'},...(selected?.catalog as unknown as SheetTab[]??[]).map(t=>({value:String(t.sheetId),label:t.title}))]}/><p className="text-xs text-muted-foreground">Apply a workbook filter to load its worksheets.</p></div>
 {(['from','to'] as const).map(key=><div key={key} className="space-y-2"><Label htmlFor={`accounting-${key}`}>{key==='from'?'From':'Through'}</Label><Input id={`accounting-${key}`} type="date" name={key} defaultValue={p[key]??''}/></div>)}
 {['person','category','company','supplier'].map(key=><div key={key} className="space-y-2"><Label htmlFor={`accounting-${key}`} className="capitalize">{key}</Label><Input id={`accounting-${key}`} name={key} maxLength={150} defaultValue={p[key]} placeholder="Exact name, or use Search"/></div>)}
 <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end lg:col-span-4"><Button variant="outline" nativeButton={false} render={<Link href="/accounting"/>}>Reset filters</Button><Button type="submit">Apply filters</Button></div></form></CardContent></Card>
 <div className="flex flex-wrap items-center justify-between gap-3"><p>{count??0} matching expense rows · page {page}</p><CsvExportButton filename="accounting-sheet-expenses.csv" label="Export this page" header={['Workbook','Worksheet','Date','Voucher','Category','Particulars','Person','Supplier','Plate','Receipt','Amount']} rows={(rows??[]).map(r=>[byId.get(r.book_id)?.name??r.book_id,r.sheet_name,r.expense_date??'',r.voucher,r.category,r.particulars,r.person,r.supplier,r.plate,r.receipt_number,r.amount])}/></div>
 <ResponsiveList rows={rows??[]} getRowKey={r=>`${r.book_id}:${r.sheet_id}:${r.source_row}`} columns={[
 {key:'source',header:'Source',cell:r=><a className="underline underline-offset-4" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${byId.get(r.book_id)?.spreadsheet_id}/edit#gid=${r.sheet_id}&range=A${r.source_row}`}>{byId.get(r.book_id)?.name}<br/><span className="text-xs text-muted-foreground">{r.sheet_name} · row {r.source_row}</span></a>},
 {key:'date',header:'Expense date',cell:r=><span className="whitespace-nowrap">{r.expense_date??'Date not identified'}</span>},
 {key:'voucher',header:'Voucher / person',cell:r=><><span className="font-mono">{r.voucher}</span><br/>{r.person}</>},
 {key:'particulars',header:'Particulars',className:'min-w-56 whitespace-pre-wrap',cell:r=><>{r.particulars}<br/><span className="text-muted-foreground">{r.plate} {r.receipt_number}</span></>},
 {key:'category',header:'Category / supplier',cell:r=><>{r.category}<br/>{r.supplier}</>},
 {key:'amount',header:'Amount',headerClassName:'text-right',className:'text-right whitespace-nowrap',cell:r=><MoneyText value={r.amount}/>},
 ]} renderCard={r=><Card><CardHeader><CardTitle className="flex flex-wrap justify-between gap-2"><span className="min-w-0 break-words font-mono">{r.voucher||'Expense'}</span><MoneyText value={r.amount} className="whitespace-nowrap"/></CardTitle></CardHeader><CardContent className="space-y-3"><p className="whitespace-pre-wrap break-words">{r.particulars}</p><dl className="grid grid-cols-2 gap-3 text-sm">{[['Date',r.expense_date??'Not identified'],['Person',r.person],['Category',r.category],['Supplier',r.supplier],['Plate',r.plate],['Receipt',r.receipt_number]].map(([label,value])=><div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words">{value||'—'}</dd></div>)}</dl><a className="block break-words text-sm underline underline-offset-4" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${byId.get(r.book_id)?.spreadsheet_id}/edit#gid=${r.sheet_id}&range=A${r.source_row}`}>{byId.get(r.book_id)?.name} · {r.sheet_name} · row {r.source_row}</a></CardContent></Card>} empty={<EmptyState icon={Files} title="No matching expenses" description="Refresh a workbook or choose All history to see older expenses."/>}/>
 <p className="text-xs text-muted-foreground">Historical worksheets may overlap. Totals here describe the displayed source rows, not reconciled fund cash.</p><p className="text-sm">Expense total on this page: <MoneyText value={(rows??[]).reduce((s,r)=>s+Number(r.amount),0)}/></p><div className="flex justify-between print:hidden">{page>1?<Button variant="outline" nativeButton={false} render={<Link href={url(page-1)}/>}>Previous</Button>:<span/>}{page*50<(count??0)?<Button variant="outline" nativeButton={false} render={<Link href={url(page+1)}/>}>Next</Button>:null}</div></div>;
}
