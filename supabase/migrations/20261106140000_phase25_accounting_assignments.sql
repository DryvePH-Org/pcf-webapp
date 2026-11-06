-- Accounting can assign custodians; fund amounts/limits and user administration
-- remain admin-only. Serialize assignments and audit the junction changes.
create or replace function public.set_fund_custodians(p_fund_id uuid,p_custodian_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare ids uuid[]:=array(select distinct x from unnest(coalesce(p_custodian_ids,'{}')) x);
begin
  perform public.require_role(array['admin','accounting']::public.user_role[]);
  perform 1 from public.profiles where id=any(ids) order by id for share;
  if cardinality(ids)>20 then raise exception 'A fund can have at most 20 custodians'; end if;
  if (select count(*) from public.profiles where id=any(ids) and role='custodian' and is_active)<>cardinality(ids)
    then raise exception 'Funds can only be assigned to an active custodian'; end if;
  perform 1 from public.funds where id=p_fund_id for update;
  if not found then raise exception 'Fund not found'; end if;
  delete from public.fund_custodians where fund_id=p_fund_id and not(custodian_id=any(ids));
  insert into public.fund_custodians(fund_id,custodian_id) select p_fund_id,x from unnest(ids) x on conflict do nothing;
end $$;
create or replace function public.assign_custodian_funds(p_user_id uuid,p_fund_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare ids uuid[]:=coalesce(p_fund_ids,'{}');
begin
  perform public.require_role(array['admin','accounting']::public.user_role[]);
  perform 1 from public.profiles where id=p_user_id and role='custodian' and is_active for update;
  if not found then raise exception 'Funds can only be assigned to an active custodian'; end if;
  perform 1 from public.funds where id=any(ids) or id in(select fund_id from public.fund_custodians where custodian_id=p_user_id) order by id for update;
  if exists(select 1 from public.funds f where f.id=any(ids) and f.is_active
    and not exists(select 1 from public.fund_custodians where fund_id=f.id and custodian_id=p_user_id)
    and (select count(*) from public.fund_custodians where fund_id=f.id)>=20)
    then raise exception 'A fund can have at most 20 custodians'; end if;
  delete from public.fund_custodians where custodian_id=p_user_id and not(fund_id=any(ids));
  insert into public.fund_custodians(fund_id,custodian_id) select id,p_user_id from public.funds where id=any(ids) and is_active on conflict do nothing;
end $$;
create function public.audit_fund_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    insert into public.audit_log(entity_type,entity_id,action,actor_id,old_data,new_data)
      values('funds',old.fund_id,'update',auth.uid(),to_jsonb(old),null);
    return old;
  end if;
  insert into public.audit_log(entity_type,entity_id,action,actor_id,old_data,new_data)
    values('funds',new.fund_id,'update',auth.uid(),null,to_jsonb(new));
  return new;
end $$;
create trigger fund_custodians_audit after insert or delete on public.fund_custodians for each row execute function public.audit_fund_assignment();

-- Keep historical counts and audit entries; retire the callable write surface.
revoke execute on function public.record_cash_count(uuid,numeric,text) from public,anon,authenticated,service_role;
revoke insert,update,delete on public.cash_counts from anon,authenticated;
