'use client';
import { useCallback,useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
export function SheetsRefresh({book=''}:{book?:string}) {
 const router=useRouter();const [pending,setPending]=useState(false);const [message,setMessage]=useState('');
 const refresh=useCallback(async()=>{
  if(document.visibilityState!=='visible')return;setPending(true);
  try{const response=await fetch('/api/sheets/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({book})});const data=await response.json();setMessage(response.ok?'Refresh queued. Last synced time updates when complete.':data.error);router.refresh();}
  catch{setMessage('Refresh unavailable. Showing the last saved snapshot.');}finally{setPending(false);}
 },[book,router]);
 useEffect(()=>{const poll=setInterval(()=>{if(document.visibilityState==='visible')router.refresh();},15000);const sync=setInterval(()=>void refresh(),90000);return()=>{clearInterval(poll);clearInterval(sync);};},[refresh,router]);
 return <div className="space-y-2 print:hidden"><Button variant="outline" disabled={pending} onClick={()=>void refresh()}>{pending?'Requesting refresh…':'Refresh now'}</Button><p role="status" className="text-xs text-muted-foreground">{message||'Background refresh runs while this page is open.'}</p></div>;
}
