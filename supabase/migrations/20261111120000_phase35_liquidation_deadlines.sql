-- Outstanding advances follow the requester account across every primary role.
create view public.outstanding_liquidations_v with (security_invoker=true) as
select v.id as voucher_id,v.pcv_number,v.fund_id,f.name as fund_name,v.amount,
 coalesce(r.requester_id,v.prepared_by) as owner_id,v.released_at,
 v.released_at+interval '48 hours' as due_at,
 l.id as liquidation_id,coalesce(l.status,'not_filed') as liquidation_status,
 v.released_at+interval '48 hours'<=now() as overdue
from public.vouchers v join public.funds f on f.id=v.fund_id
left join public.budget_requests r on r.id=v.budget_request_id
left join public.liquidations l on l.voucher_id=v.id
where v.released_at is not null and v.status not in ('void','closed')
 and (l.id is null or l.status not in ('submitted','approved'));
revoke all on public.outstanding_liquidations_v from anon,authenticated;
grant select on public.outstanding_liquidations_v to service_role;

create function public.my_outstanding_liquidations() returns setof public.outstanding_liquidations_v
language plpgsql stable security definer set search_path=public as $$
begin
 if public.app_role() is null then raise exception 'Sign in first'; end if;
 return query select * from public.outstanding_liquidations_v where owner_id=auth.uid() order by due_at,voucher_id;
end $$;
revoke all on function public.my_outstanding_liquidations() from public,anon;
grant execute on function public.my_outstanding_liquidations() to authenticated;

create table public.liquidation_reminders (
 id uuid primary key default gen_random_uuid(),
 voucher_id uuid not null references public.vouchers(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id),
 reminder_date date not null,
 created_at timestamptz not null default now(),
 unique(voucher_id,reminder_date)
);
alter table public.liquidation_reminders enable row level security;
revoke all on public.liquidation_reminders from anon,authenticated;
grant select on public.liquidation_reminders to authenticated;
grant all on public.liquidation_reminders to service_role;
create policy liquidation_reminders_read on public.liquidation_reminders for select to authenticated using(recipient_id=auth.uid());

create function public.generate_liquidation_reminders() returns integer
language plpgsql security definer set search_path=public as $$
declare inserted integer;
begin
 insert into public.liquidation_reminders(voucher_id,recipient_id,reminder_date)
 select voucher_id,owner_id,(now() at time zone 'Asia/Manila')::date
 from public.outstanding_liquidations_v where overdue
 on conflict(voucher_id,reminder_date) do nothing;
 get diagnostics inserted=row_count;
 return inserted;
end $$;
revoke all on function public.generate_liquidation_reminders() from public,anon,authenticated;
grant execute on function public.generate_liquidation_reminders() to service_role;

-- Preserve the existing RPC contract while enforcing the restriction server-side.
alter function public.create_budget_request(uuid,text,numeric,text) rename to create_budget_request_before_deadlines;
revoke all on function public.create_budget_request_before_deadlines(uuid,text,numeric,text) from public,anon,authenticated;
create function public.create_budget_request(p_fund_id uuid,p_name text,p_amount numeric,p_purpose text)
returns uuid language plpgsql security definer set search_path=public as $$
declare outstanding text;
begin
 perform 1 from public.profiles where id=auth.uid() and is_active for update;
 if not found then raise exception 'Sign in first'; end if;
 select pcv_number into outstanding from public.outstanding_liquidations_v where owner_id=auth.uid() order by released_at limit 1;
 if found then raise exception 'You still have an outstanding liquidation for voucher %. Complete and submit it before requesting another budget.',outstanding; end if;
 return public.create_budget_request_before_deadlines(p_fund_id,p_name,p_amount,p_purpose);
end $$;
revoke all on function public.create_budget_request(uuid,text,numeric,text) from public,anon;
grant execute on function public.create_budget_request(uuid,text,numeric,text) to authenticated;

-- Daily reminders survive app restarts and are generated once per Manila day.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('pcf-liquidation-reminders','0 * * * *','select public.generate_liquidation_reminders();');
 end if;
end $$;
select public.generate_liquidation_reminders();

-- A receipt review may be saved while its lines are being reconciled.
-- Approval still validates the reviewed lines against the declared actual spending.
do $$ declare definition text; begin
 select pg_get_functiondef('public.save_custodian_receipts(uuid,int,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'if total<>l.total_spent then raise exception ''Receipt line total must equal the requester total of %'',l.total_spent; end if;','');
 definition:=replace(definition,'receipt_reviewed_by=auth.uid()','receipt_reviewed_by=case when total=l.total_spent then auth.uid() else null end');
 execute definition;
end $$;
