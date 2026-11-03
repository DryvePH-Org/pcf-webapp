-- Phase 18: a fund can have several custodians.
-- fund_custodians becomes the single source of truth; funds.custodian_id goes.
-- Any assigned custodian may prepare and release their own vouchers, count the
-- cash and request replenishments for that fund.

create table public.fund_custodians (
  fund_id uuid not null references public.funds(id) on delete cascade,
  custodian_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (fund_id, custodian_id)
);

create index fund_custodians_custodian_idx on public.fund_custodians (custodian_id);

alter table public.fund_custodians enable row level security;
create policy fund_custodians_select on public.fund_custodians
  for select to authenticated using (public.app_role() is not null);

revoke all on public.fund_custodians from anon, authenticated;
grant select on public.fund_custodians to authenticated;

insert into public.fund_custodians (fund_id, custodian_id)
select id, custodian_id from public.funds where custodian_id is not null
on conflict do nothing;

create or replace function public.can_access_fund(p_fund_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select r.role is not null
    and (
      r.role <> 'custodian'
      or exists (
        select 1 from public.fund_custodians fc
        where fc.fund_id = p_fund_id and fc.custodian_id = auth.uid()
      )
    )
  from (select public.app_role() as role) r;
$$;

create or replace function public.require_fund_access(p_fund_id uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.app_role() = 'custodian'
     and not exists (
       select 1 from public.fund_custodians
       where fund_id = p_fund_id and custodian_id = auth.uid()
     ) then
    raise exception 'You are not a custodian of this fund';
  end if;
end $$;

alter table public.funds drop column custodian_id;

-- Sets exactly which funds this custodian holds. Other custodians of those
-- funds are not affected.
create or replace function public.assign_custodian_funds(p_user_id uuid, p_fund_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role(array['admin']::public.user_role[]);

  if not exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'custodian' and is_active
  ) then
    raise exception 'Funds can only be assigned to an active custodian';
  end if;

  delete from public.fund_custodians
  where custodian_id = p_user_id
    and not (fund_id = any (coalesce(p_fund_ids, '{}')));

  insert into public.fund_custodians (fund_id, custodian_id)
  select f.id, p_user_id
  from public.funds f
  where f.id = any (coalesce(p_fund_ids, '{}')) and f.is_active
  on conflict do nothing;
end $$;

-- Sets exactly which custodians a fund has.
create or replace function public.set_fund_custodians(p_fund_id uuid, p_custodian_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[] := coalesce(p_custodian_ids, '{}');
begin
  perform public.require_role(array['admin']::public.user_role[]);

  if not exists (select 1 from public.funds where id = p_fund_id) then
    raise exception 'Fund not found';
  end if;
  if cardinality(v_ids) > 20 then
    raise exception 'A fund can have at most 20 custodians';
  end if;
  if (select count(*) from public.profiles
      where id = any (v_ids) and role = 'custodian' and is_active)
     <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'Funds can only be assigned to an active custodian';
  end if;

  delete from public.fund_custodians
  where fund_id = p_fund_id and not (custodian_id = any (v_ids));

  insert into public.fund_custodians (fund_id, custodian_id)
  select p_fund_id, x from unnest(v_ids) x
  on conflict do nothing;
end $$;

revoke execute on function public.assign_custodian_funds(uuid, uuid[]) from public, anon;
grant execute on function public.assign_custodian_funds(uuid, uuid[]) to authenticated, service_role;
revoke execute on function public.set_fund_custodians(uuid, uuid[]) from public, anon;
grant execute on function public.set_fund_custodians(uuid, uuid[]) to authenticated, service_role;
