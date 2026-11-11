'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {retrySheetRollover} from '@/actions/sheets';
import {Button} from '@/components/ui/button';
export function RolloverRetry({id}:{id:string}){const [pending,setPending]=useState(false);const router=useRouter();return <Button disabled={pending} variant="outline" onClick={async()=>{setPending(true);try{await retrySheetRollover(id);router.refresh();}finally{setPending(false);}}}>{pending?'Checking…':'Retry replenishment encoding'}</Button>;}
