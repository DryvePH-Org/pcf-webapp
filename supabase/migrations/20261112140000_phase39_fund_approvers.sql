-- Phase 39: fund approvers.
-- An admin assigns approvers to a fund. When the person requesting budget is a
-- custodian of that same fund (and the fund has an approver), the assigned
-- approver is the gateway: they review the request and prepare the voucher,
-- instead of another custodian. Nobody releases cash for their own request.
-- Requests from everyone else are reviewed exactly as before.

create table public.fund_approvers (
  fund_id uuid not null references public.funds(id) on delete cascade,
  approver_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fund_id, approver_id)
);
create index fund_approvers_approver_idx on public.fund_approvers(approver_id);
alter table public.fund_approvers enable row level security;
revoke all on public.fund_approvers from anon, authenticated;
grant select on public.fund_approvers to authenticated;
grant all on public.fund_approvers to service_role;
create policy fund_approvers_select on public.fund_approvers for select to authenticated
  using (public.app_role() in ('admin', 'custodian', 'approver', 'accounting'));
create trigger fund_approvers_audit after insert or delete on public.fund_approvers
  for each row execute function public.audit_fund_assignment();

-- ------------------------------------------------------------------ helpers
create function public.fund_has_approver(p_fund uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fund_approvers fa
    join public.profiles p on p.id = fa.approver_id
    where fa.fund_id = p_fund and p.is_active and p.role = 'approver'
  );
$$;

-- The signed-in user is an approver assigned to this fund.
create function public.is_fund_approver(p_fund uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'approver' and exists (
    select 1 from public.fund_approvers where fund_id = p_fund and approver_id = auth.uid()
  ), false);
$$;

create function public.is_fund_custodian_user(p_fund uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fund_custodians fc
    join public.profiles p on p.id = fc.custodian_id
    where fc.fund_id = p_fund and fc.custodian_id = p_user and p.role = 'custodian'
  );
$$;

-- A custodian's own request in a fund that has an assigned approver.
create function public.request_needs_fund_approver(p_fund uuid, p_requester uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_fund_custodian_user(p_fund, p_requester) and public.fund_has_approver(p_fund);
$$;

revoke execute on function public.fund_has_approver(uuid), public.is_fund_approver(uuid),
  public.is_fund_custodian_user(uuid, uuid), public.request_needs_fund_approver(uuid, uuid)
  from public, anon;
grant execute on function public.fund_has_approver(uuid), public.is_fund_approver(uuid),
  public.is_fund_custodian_user(uuid, uuid), public.request_needs_fund_approver(uuid, uuid)
  to authenticated, service_role;

-- ------------------------------------------------------------- assignment
create function public.set_fund_approvers(p_fund_id uuid, p_approver_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare ids uuid[] := array(select distinct x from unnest(coalesce(p_approver_ids, '{}')) x);
begin
  perform public.require_role(array['admin']::public.user_role[]);
  if cardinality(ids) > 20 then raise exception 'A fund can have at most 20 approvers'; end if;
  perform 1 from public.profiles where id = any(ids) order by id for share;
  if (select count(*) from public.profiles where id = any(ids) and role = 'approver' and is_active) <> cardinality(ids)
    then raise exception 'Only active approvers can be assigned to a fund'; end if;
  perform 1 from public.funds where id = p_fund_id for update;
  if not found then raise exception 'Fund not found'; end if;
  delete from public.fund_approvers where fund_id = p_fund_id and not (approver_id = any(ids));
  insert into public.fund_approvers(fund_id, approver_id)
    select p_fund_id, x from unnest(ids) x on conflict do nothing;
end $$;
revoke execute on function public.set_fund_approvers(uuid, uuid[]) from public, anon;
grant execute on function public.set_fund_approvers(uuid, uuid[]) to authenticated, service_role;

-- For the request form: who reviews my request in each fund.
create function public.list_fund_review_routes()
returns table(fund_id uuid, approver_names text[], i_am_custodian boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_role(array['admin','custodian','approver','accounting','requester']::public.user_role[]);
  return query
    select f.id,
      coalesce((select array_agg(p.full_name order by p.full_name)
        from public.fund_approvers fa join public.profiles p on p.id = fa.approver_id
        where fa.fund_id = f.id and p.is_active and p.role = 'approver'), '{}'::text[]),
      public.is_fund_custodian_user(f.id, auth.uid())
    from public.funds f where f.is_active;
end $$;
revoke execute on function public.list_fund_review_routes() from public, anon;
grant execute on function public.list_fund_review_routes() to authenticated, service_role;

-- --------------------------------------------------- who can see a request
drop policy budget_requests_select on public.budget_requests;
create policy budget_requests_select on public.budget_requests for select to authenticated using (
  public.app_role() is not null and (
    requester_id = auth.uid() or public.app_role() in ('admin', 'accounting')
    or (public.app_role() = 'custodian' and public.can_access_fund(fund_id))
    or (public.is_fund_approver(fund_id) and public.is_fund_custodian_user(fund_id, requester_id))
  )
);

create or replace function public.request_voucher_summary(p_request_id uuid)
returns table(id uuid, pcv_number text, amount numeric, status public.voucher_status, released_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.app_role() is null or not exists (
    select 1 from public.budget_requests r where r.id = p_request_id and (
      r.requester_id = auth.uid() or public.app_role() in ('admin','accounting')
      or (public.app_role() = 'custodian' and public.can_access_fund(r.fund_id))
      or (public.is_fund_approver(r.fund_id) and public.is_fund_custodian_user(r.fund_id, r.requester_id))
    )
  ) then raise exception 'Request not found'; end if;
  return query select v.id, v.pcv_number, v.amount, v.status, v.released_at from public.vouchers v where v.budget_request_id = p_request_id;
end $$;

-- ------------------------------------------------------------ the gateway
create or replace function public.review_budget_request(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.budget_requests%rowtype; v_role public.user_role; v_name text;
begin
  v_role := public.require_role(array['custodian','approver','admin']::public.user_role[]);
  select * into r from public.budget_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'submitted' then raise exception 'Only submitted requests can be reviewed'; end if;
  if r.requester_id = auth.uid() then raise exception 'You cannot review your own request'; end if;
  perform public.require_fund_access(r.fund_id);
  if v_role = 'approver' and not (public.is_fund_approver(r.fund_id) and public.is_fund_custodian_user(r.fund_id, r.requester_id)) then
    raise exception 'Approvers review a custodian''s own request in the funds they are assigned to';
  end if;
  if v_role = 'custodian' and public.request_needs_fund_approver(r.fund_id, r.requester_id) then
    raise exception 'This is a custodian''s own request. The fund''s assigned approver reviews it';
  end if;
  if p_approve is null then raise exception 'Choose approve or reject'; end if;
  if not p_approve and nullif(btrim(p_note), '') is null then raise exception 'A rejection reason is required'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.budget_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewer_name = v_name, reviewed_at = now(), review_note = nullif(btrim(p_note), '') where id = p_id;
end $$;

create or replace function public.create_voucher_from_request(
  p_request_id uuid, p_items jsonb, p_voucher_date date default current_date, p_no_receipt_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare r public.budget_requests%rowtype; v_id uuid; v_total numeric; v_role public.user_role;
begin
  v_role := public.require_role(array['custodian','approver','admin']::public.user_role[]);
  select * into r from public.budget_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'approved' then raise exception 'Approve this request before creating its voucher'; end if;
  if r.requester_id = auth.uid() then raise exception 'Another person must prepare your requested voucher'; end if;
  perform public.require_fund_access(r.fund_id);
  if v_role = 'approver' and not (public.is_fund_approver(r.fund_id) and public.is_fund_custodian_user(r.fund_id, r.requester_id)) then
    raise exception 'Approvers prepare the voucher for a custodian''s own request in the funds they are assigned to';
  end if;
  if v_role = 'custodian' and public.request_needs_fund_approver(r.fund_id, r.requester_id) then
    raise exception 'This is a custodian''s own request. The fund''s assigned approver prepares its voucher';
  end if;
  -- Existing voucher validation and limits run inside the same transaction.
  v_id := public.create_voucher_lines(r.fund_id, r.requester_name, p_items, p_voucher_date, null, p_no_receipt_reason);
  select amount into v_total from public.vouchers where id = v_id;
  if v_total > r.amount then raise exception 'Voucher total exceeds the approved budget'; end if;
  update public.vouchers set budget_request_id = r.id where id = v_id;
  update public.budget_requests set status = 'voucher_created' where id = r.id;
  return v_id;
end $$;

-- Cash for a request is never released by the person who asked for it.
create function public.block_self_release() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.released_at is not null and old.released_at is null and new.budget_request_id is not null
     and exists (select 1 from public.budget_requests r where r.id = new.budget_request_id and r.requester_id = auth.uid()) then
    raise exception 'Another person must release the cash for your own request';
  end if;
  return new;
end $$;
create trigger vouchers_block_self_release before update of released_at on public.vouchers
  for each row execute function public.block_self_release();
