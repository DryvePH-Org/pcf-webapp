create view public.replenishment_eligibility_v with(security_invoker=true) as
select v.id as voucher_id,v.fund_id,v.pcv_number,v.payee,v.amount as advance_amount,v.replenishment_id,
  v.status as voucher_status,l.id as liquidation_id,l.status as liquidation_status,l.total_spent,
  case when v.status not in ('released','approved') then 'Voucher is flagged, void, or closed'
    when v.replenishment_id is not null then 'Already assigned to replenishment'
    when l.id is null then 'Liquidation not filed'
    when l.status<>'approved' then 'Liquidation needs approval'
    when l.total_spent=0 then 'Unused advance must be returned'
    when l.total_spent<>l.amount_received and s.id is null then 'Cash return or reimbursement not recorded'
    else null end as exclusion_reason,
  (v.status in ('released','approved') and v.replenishment_id is null and l.status='approved'
    and l.total_spent>0 and (l.total_spent=l.amount_received or s.id is not null)) is true as eligible
from public.vouchers v left join public.liquidations l on l.voucher_id=v.id
left join public.cash_settlements s on s.voucher_id=v.id where v.released_at is not null;
grant select on public.replenishment_eligibility_v to authenticated,service_role;
revoke all on public.replenishment_eligibility_v from anon;

create table public.replenishment_items (
  id uuid primary key default gen_random_uuid(),
  replenishment_id uuid not null references public.replenishments(id),
  voucher_id uuid not null references public.vouchers(id),
  liquidation_id uuid references public.liquidations(id),
  fund_id uuid not null references public.funds(id),
  amount numeric(12,2) not null check(amount>0),
  unique(replenishment_id,voucher_id)
);
alter table public.replenishment_items enable row level security;
revoke all on public.replenishment_items from anon,authenticated;
grant select on public.replenishment_items to authenticated;
grant all on public.replenishment_items to service_role;
create policy replenishment_items_read on public.replenishment_items for select to authenticated using(public.can_access_fund(fund_id));
insert into public.replenishment_items(replenishment_id,voucher_id,fund_id,amount)
  select replenishment_id,id,fund_id,amount from public.vouchers where replenishment_id is not null;
create trigger replenishment_items_audit after insert on public.replenishment_items for each row execute function public.log_audit();

create or replace function public.create_replenishment(p_fund_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare ids uuid[]; total numeric; rid uuid; num bigint; yr int:=extract(year from now() at time zone 'Asia/Manila');
begin
  perform public.require_role(array['custodian','admin']::public.user_role[]);
  perform public.require_fund_access(p_fund_id);
  perform 1 from public.funds where id=p_fund_id and is_active for update;
  if not found then raise exception 'Fund not found or inactive'; end if;
  select array_agg(id) into ids from (select v.id from public.vouchers v
    where v.fund_id=p_fund_id and v.id in(select voucher_id from public.replenishment_eligibility_v where eligible)
    order by v.voucher_date,v.created_at,v.id limit 100 for update) q;
  if ids is null then raise exception 'No approved, settled liquidations are available to replenish'; end if;
  select sum(total_spent) into total from public.liquidations where voucher_id=any(ids);
  num:=nextval('public.replenishment_no_seq');
  insert into public.replenishments(fund_id,request_no,status,total,requested_by)
    values(p_fund_id,format('REP-%s-%s',yr,lpad(num::text,4,'0')),'draft',total,auth.uid()) returning id into rid;
  insert into public.replenishment_items(replenishment_id,voucher_id,liquidation_id,fund_id,amount)
    select rid,v.id,l.id,v.fund_id,l.total_spent from public.vouchers v join public.liquidations l on l.voucher_id=v.id where v.id=any(ids);
  update public.vouchers set replenishment_id=rid where id=any(ids);
  return rid;
end $$;

create function public.validate_replenishment(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare expected numeric; actual numeric; bad int; n int;
begin
  select total into expected from public.replenishments where id=p_id;
  select count(*),coalesce(sum(i.amount),0),count(*) filter(where v.replenishment_id is distinct from p_id
    or v.status not in ('released','approved') or v.released_at is null or l.status is distinct from 'approved'
    or l.total_spent is distinct from i.amount or (l.total_spent<>l.amount_received and s.id is null))
    into n,actual,bad from public.replenishment_items i join public.vouchers v on v.id=i.voucher_id
    left join public.liquidations l on l.id=i.liquidation_id left join public.cash_settlements s on s.liquidation_id=l.id
    where i.replenishment_id=p_id;
  if n=0 or bad>0 or actual is distinct from expected then raise exception 'Replenishment contains an ineligible, unsettled, or changed voucher; reject and rebuild it'; end if;
end $$;
revoke execute on function public.validate_replenishment(uuid) from public,anon,authenticated;

create or replace function public.submit_replenishment(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.replenishments%rowtype;
begin
  perform public.require_role(array['custodian','admin']::public.user_role[]);
  perform 1 from public.funds where id=(select fund_id from public.replenishments where id=p_id) for update;
  select * into r from public.replenishments where id=p_id for update;
  if not found or r.status<>'draft' then raise exception 'Only draft replenishments can be submitted'; end if;
  perform public.require_fund_access(r.fund_id);
  if r.requested_by<>auth.uid() and public.app_role()<>'admin' then raise exception 'Only the preparer can submit this replenishment'; end if;
  perform 1 from public.vouchers where replenishment_id=p_id order by id for update;
  perform public.validate_replenishment(p_id);
  update public.replenishments set status='submitted' where id=p_id;
end $$;

create or replace function public.review_replenishment(p_id uuid,p_approve boolean,p_note text default null) returns void
language plpgsql security definer set search_path=public as $$
declare r public.replenishments%rowtype;
begin
  perform public.require_role(array['accounting','admin']::public.user_role[]);
  perform 1 from public.funds where id=(select fund_id from public.replenishments where id=p_id) for update;
  select * into r from public.replenishments where id=p_id for update;
  if not found or (r.status<>'submitted' and not(r.status='approved' and p_approve=false)) then raise exception 'This replenishment cannot be reviewed'; end if;
  if p_approve is null or (not p_approve and nullif(btrim(p_note),'') is null) then raise exception 'A rejection reason is required'; end if;
  perform 1 from public.vouchers where replenishment_id=p_id order by id for update;
  if p_approve then perform public.validate_replenishment(p_id); end if;
  update public.replenishments set status=(case when p_approve then 'approved' else 'rejected' end)::public.replenishment_status,
    reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(p_note),'') where id=p_id;
  if not p_approve then update public.vouchers set replenishment_id=null where replenishment_id=p_id; end if;
end $$;

create or replace function public.close_replenishment(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.replenishments%rowtype;
begin
  perform public.require_role(array['accounting','admin']::public.user_role[]);
  perform 1 from public.funds where id=(select fund_id from public.replenishments where id=p_id) for update;
  select * into r from public.replenishments where id=p_id for update;
  if not found or r.status<>'approved' or r.reviewed_by is null then raise exception 'Approve this replenishment before confirming cash received'; end if;
  perform 1 from public.vouchers where replenishment_id=p_id order by id for update;
  perform public.validate_replenishment(p_id);
  update public.vouchers set status='closed' where replenishment_id=p_id;
  update public.replenishments set status='closed' where id=p_id;
end $$;

create function public.replenishment_fund_options()
returns table(fund_id uuid,fund_name text,voucher_count bigint,total numeric)
language plpgsql stable security definer set search_path=public as $$
begin
  perform public.require_role(array['custodian','admin','accounting']::public.user_role[]);
  return query select f.id,f.name,count(q.id),sum(q.total_spent)
    from public.funds f cross join lateral (
      select v.id,l.total_spent from public.vouchers v join public.liquidations l on l.voucher_id=v.id
      where v.fund_id=f.id and v.id in(select voucher_id from public.replenishment_eligibility_v where eligible)
      order by v.voucher_date,v.created_at,v.id limit 100
    ) q where f.is_active and public.can_access_fund(f.id) group by f.id,f.name order by f.name;
end $$;
revoke execute on function public.replenishment_fund_options() from public,anon;
grant execute on function public.replenishment_fund_options() to authenticated,service_role;
