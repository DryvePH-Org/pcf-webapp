import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { sheetsAdmin } from '@/lib/sheets/bridge';
import { WorkbookAssignment } from '@/components/sheets/assignment-form';
import { PageHeader } from '@/components/layout/page-header';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
export default async function SheetsAssignmentsPage() {
 await requireUser('/admin/sheets');const db=await createClient();
 const [books,custodians,funds]=await Promise.all([sheetsAdmin().from('sheet_workbooks').select('*').order('name'),db.from('profiles').select('id,full_name').eq('role','custodian').eq('is_active',true).order('full_name'),db.from('funds').select('id,name').eq('is_active',true).order('name')]);
 for(const r of [books,custodians,funds])if(r.error)throw new Error(r.error.message);
 return <div className="space-y-6"><PageHeader title="Google Sheets assignments" description="Choose which workbook and fund each approving custodian handles." actions={<Button variant="outline" nativeButton={false} render={<Link href="/accounting"/>}>Accounting dashboard</Button>}/>{books.data?.map(book=><WorkbookAssignment key={`${book.id}:${book.config_version}`} book={book} custodians={custodians.data??[]} funds={funds.data??[]}/>)}</div>;
}
