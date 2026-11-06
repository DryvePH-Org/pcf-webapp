import { PageHeader } from "@/components/layout/page-header";
import { RequestForm } from "@/components/requests/request-form";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NewRequestPage() {
  const user = await requireUser("/requests/new");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_request_funds");
  if (error) throw new Error(error.message);
  return <div className="space-y-6"><PageHeader title="Request a budget" description="Choose a fund and explain what the budget is for." />
    {data.length ? <RequestForm funds={data} name={user.full_name} /> : <p className="rounded-xl border p-6 text-muted-foreground">No funds are available for requests. A fund must be active and have an active custodian assigned.</p>}
  </div>;
}
