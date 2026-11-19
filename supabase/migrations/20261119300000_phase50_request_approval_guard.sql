-- Phase 50: a budget request that needs an approver can never sit "approved" without one.
-- A ₱5,000 request approved by the custodian alone (the old flow) could not become a voucher:
-- the approver step had been skipped and the voucher was held at the per-transaction limit.
-- Four layers stop that happening again:
--   1. A database rule: a request cannot become approved (or turn into a voucher) while it needs an
--      approver and none has approved it, whoever or whatever tries to change it.
--   2. A sweep: any large request found approved without an approver goes back to "Awaiting approver",
--      and the approver is told. It runs now, and again whenever an administrator changes a fund's limits.
--   3. Anything above the per-transaction limit always needs an approver, even if the approval limit is higher.
--   4. Plain-language messages where a voucher is refused.

-- 3. What needs an approver: reaching the approval limit, or going above the per-transaction limit.
create or replace function public.request_needs_approver(p_fund uuid, p_amount numeric) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p_amount >= f.approval_threshold or p_amount > f.per_txn_limit
                   from public.funds f where f.id = p_fund), false);
$$;

-- 1. The rule itself.
create function public.guard_request_approver() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('approved', 'voucher_created') and new.status is distinct from old.status
     and new.approver_id is null and public.request_needs_approver(new.fund_id, new.amount) then
    raise exception 'This budget request needs an approver''s approval first. Ask the fund''s approver to approve it.';
  end if;
  return new;
end $$;
create trigger budget_requests_approver_guard before update of status on public.budget_requests
  for each row execute function public.guard_request_approver();

-- 2. The sweep. Only a request that is approved, has no voucher yet (that is what "approved" means) and still
-- lacks an approver is moved; everything else is left alone. The approvers are told in the app.
create function public.resync_request_approvals(p_fund uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare moved record; targets uuid[]; n integer := 0;
begin
  for moved in
    select r.id, r.fund_id, r.request_no, r.requester_id, r.reviewed_by, r.amount
    from public.budget_requests r
    where r.status = 'approved' and r.approver_id is null and (p_fund is null or r.fund_id = p_fund)
      and public.request_needs_approver(r.fund_id, r.amount)
    order by r.created_at
    for update
  loop
    update public.budget_requests set status = 'awaiting_approver' where id = moved.id;
    n := n + 1;
    select coalesce(array_agg(fa.approver_id), '{}') into targets
    from public.fund_approvers fa join public.profiles p on p.id = fa.approver_id and p.is_active
    where fa.fund_id = moved.fund_id and fa.approver_id <> moved.requester_id
      and fa.approver_id is distinct from moved.reviewed_by;
    if cardinality(targets) = 0 then
      select coalesce(array_agg(p.id), '{}') into targets from public.profiles p
      where p.role = 'admin' and p.is_active and p.id <> moved.requester_id;
    end if;
    insert into public.notifications(user_id, event, title, body, link_path, tone, entity_type, entity_id)
    select t, 'budget.needs_approver', 'Budget request needs your approval',
           left('Request ' || moved.request_no || ' for PHP ' || to_char(moved.amount, 'FM999,999,990.00')
                || ' needs an approver before its voucher can be created.', 500),
           '/requests/' || moved.id, 'action', 'budget_requests', moved.id
    from unnest(targets) t;
  end loop;
  return n;
end $$;
revoke execute on function public.resync_request_approvals(uuid) from public, anon, authenticated;
grant execute on function public.resync_request_approvals(uuid) to service_role;

-- Changing a fund's limits can make requests that were fine need an approver; catch them at once.
create function public.resync_after_limit_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.resync_request_approvals(new.id);
  return null;
end $$;
create trigger funds_limit_change_resync after update of approval_threshold, per_txn_limit on public.funds
  for each row when (old.approval_threshold is distinct from new.approval_threshold or old.per_txn_limit is distinct from new.per_txn_limit)
  execute function public.resync_after_limit_change();

-- 4. Plain messages.
do $$
declare def text; fixed text;
  old_message constant text := 'raise exception ''Amount exceeds the per-transaction limit of %'', v_fund.per_txn_limit;';
  new_message constant text := 'raise exception ''This voucher is above the fund''''s per-transaction limit of %. A budget request that an approver approved can go above it: make the request first and ask the approver to approve it.'', v_fund.per_txn_limit;';
begin
  foreach def in array array['create_voucher_lines', 'update_voucher_lines'] loop
    select pg_get_functiondef(p.oid) into fixed from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = def;
    if position(old_message in fixed) = 0 then raise exception 'Limit message in % was not found', def; end if;
    execute replace(fixed, old_message, new_message);
  end loop;

  -- A linked voucher is refused up front, with the real reason, when the request still needs its approver.
  select pg_get_functiondef('public.create_voucher_from_request(uuid,jsonb,date,text)'::regprocedure) into def;
  fixed := replace(def, 'v_self := r.requester_id = auth.uid();',
    E'if public.request_needs_approver(r.fund_id, r.amount) and r.approver_id is null then\n    raise exception ''This budget request needs an approver''''s approval before its voucher can be created. Ask the fund''''s approver to approve it first.'';\n  end if;\n  v_self := r.requester_id = auth.uid();');
  if fixed = def then raise exception 'Voucher request check was not found'; end if;
  -- The request the limit check was told about is forgotten as soon as the lines are saved, so it can never
  -- clear a later voucher made in the same transaction.
  def := fixed;
  fixed := replace(def, 'select amount into v_total from public.vouchers where id = v_id;',
    E'perform set_config(''pcf.voucher_request'', '''', true);\n  select amount into v_total from public.vouchers where id = v_id;');
  if fixed = def then raise exception 'Voucher total lookup was not found'; end if;
  execute fixed;
end $$;

-- Put right anything already in that state.
select public.resync_request_approvals();
