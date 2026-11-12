'use client';
import {useRouter} from 'next/navigation';
import {retrySheetRollover} from '@/actions/sheets';
import {Button} from '@/components/ui/button';
import {usePending} from '@/lib/use-single-flight';
export function RolloverRetry({id}:{id:string}){const [pending,setPending,isBusy]=usePending();const router=useRouter();return <Button disabled={pending} variant="outline" onClick={async()=>{if(isBusy())return;setPending(true);try{await retrySheetRollover(id);router.refresh();}finally{setPending(false);}}}>{pending?'Checking…':'Retry replenishment encoding'}</Button>;}
