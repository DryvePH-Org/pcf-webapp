import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { DataDeletionCenter } from '@/components/admin/data-deletion-center';
export default async function DataPage(){
 await requireUser('/admin/data');const db=await createClient();
 const [funds,people]=await Promise.all([db.from('funds').select('id,name').order('name'),db.from('profiles').select('id,full_name').eq('role','custodian').order('full_name')]);
 if(funds.error||people.error)throw new Error('Could not load deletion filters');
 return <DataDeletionCenter funds={funds.data??[]} custodians={(people.data??[]).map(x=>({id:x.id,name:x.full_name}))}/>;
}
