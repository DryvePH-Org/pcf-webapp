-- Phase 45: the approver steps in after the budget request, not after the voucher.
-- When a budget request reaches the fund's approval limit, the custodian's approval is no longer
-- enough: it waits for an independent approver (or administrator) before its voucher can be created.
-- Requests below the limit are unchanged. A voucher whose request an approver already cleared
-- needs no second approval before release. Older requests that were approved before this change
-- keep the old rule (the approver approves the voucher itself).
-- Also: spending above the fund's per-transaction limit no longer blocks a reimbursement for good.
-- It needs the same independent approver as spending at the approval limit (it was a dead end:
-- the approver could not approve it and the custodian could not pay it). And a request above the
-- per-transaction limit is refused up front, because its voucher could never be created.

alter table public.budget_requests
  add column approver_id uuid references public.profiles(id),
  add column approver_name text,
  add column approver_at timestamptz,
  add column approver_note text check (char_length(approver_note) <= 300 and approver_note !~ '[\x01-\x1f\x7f<>]');
alter table public.budget_requests drop constraint budget_requests_status_check;
alter table public.budget_requests add constraint budget_requests_status_check
  check (status in ('submitted','awaiting_approver','approved','rejected','cancelled','voucher_created'));

-- ------------------------------------------------------------------ helpers
-- True when a request of this size must be cleared by an approver.
create function public.request_needs_approver(p_fund uuid, p_amount numeric) returns boolean
language sql stable security definer set search_path = public as $$
  select public.requires_pre_approval(p_fund, p_amount);
$$;

-- True when this voucher still needs an approver before its cash can go out: it reaches the limit
-- and its budget request was not already cleared by an approver for at least this amount.
create function public.voucher_needs_pre_approval(p_voucher uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.requires_pre_approval(v.fund_id, v.amount)
     and not exists (select 1 from public.budget_requests r
                     where r.id = v.budget_request_id and r.approver_id is not null and v.amount <= r.amount)
  from public.vouchers v where v.id = p_voucher;
$$;
revoke execute on function public.request_needs_approver(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.voucher_needs_pre_approval(uuid) from public, anon;
grant execute on function public.voucher_needs_pre_approval(uuid) to authenticated, service_role;

do $$
declare def text; fixed text; signature text;
begin
  foreach signature in array array['public.submit_voucher(uuid)', 'public.release_voucher(uuid)'] loop
    select pg_get_functiondef(signature::regprocedure) into def;
    fixed := replace(def, 'public.requires_pre_approval(v_voucher.fund_id, v_voucher.amount)', 'public.voucher_needs_pre_approval(v_voucher.id)');
    if fixed = def then raise exception 'Voucher approval check was not found in %', signature; end if;
    execute fixed;
  end loop;

  -- The custodian's approval of a large request moves it on to the approver.
  select pg_get_functiondef('public.review_budget_request(uuid,boolean,text)'::regprocedure) into def;
  fixed := replace(def,
    'update public.budget_requests set status = case when p_approve then ''approved'' else ''rejected'' end,
    reviewed_by = auth.uid(), reviewer_name = v_name, reviewed_at = now(), review_note = nullif(btrim(p_note), '''') where id = p_id;',
    'update public.budget_requests set
      status = case when not p_approve then ''rejected''
                    when public.request_needs_approver(r.fund_id, r.amount) and v_role = ''custodian'' then ''awaiting_approver''
                    else ''approved'' end,
      reviewed_by = auth.uid(), reviewer_name = v_name, reviewed_at = now(), review_note = nullif(btrim(p_note), ''''),
      approver_id = case when p_approve and public.request_needs_approver(r.fund_id, r.amount) and v_role in (''approver'',''admin'') then auth.uid() end,
      approver_name = case when p_approve and public.request_needs_approver(r.fund_id, r.amount) and v_role in (''approver'',''admin'') then v_name end,
      approver_at = case when p_approve and public.request_needs_approver(r.fund_id, r.amount) and v_role in (''approver'',''admin'') then now() end
    where id = p_id;');
  if fixed = def then raise exception 'Request review update was not found'; end if;
  execute fixed;

  -- A request can still be cancelled while it waits for the approver.
  select pg_get_functiondef('public.cancel_budget_request(uuid)'::regprocedure) into def;
  fixed := replace(def, 'if r.status not in (''submitted'',''approved'')', 'if r.status not in (''submitted'',''awaiting_approver'',''approved'')');
  if fixed = def then raise exception 'Request cancel check was not found'; end if;
  execute fixed;

  -- A request above the per-transaction limit could never become a voucher.
  select pg_get_functiondef('public.create_budget_request(uuid,text,numeric,text)'::regprocedure) into def;
  fixed := replace(def, 'return public.create_budget_request_before_deadlines(p_fund_id,p_name,p_amount,p_purpose);',
    'if p_amount > (select per_txn_limit from public.funds where id=p_fund_id) then raise exception ''This fund allows at most % for one request''; end if;
 return public.create_budget_request_before_deadlines(p_fund_id,p_name,p_amount,p_purpose);');
  if fixed = def then raise exception 'Request creation return was not found'; end if;
  -- the limit is shown in the message
  fixed := replace(fixed, 'at most % for one request''; end if;', 'at most % for one request'',(select per_txn_limit from public.funds where id=p_fund_id); end if;');
  execute fixed;

  -- Spending above the per-transaction limit needs the independent approver instead of being refused.
  select pg_get_functiondef('public.record_liquidation_settlement(uuid,numeric,text)'::regprocedure) into def;
  fixed := replace(def,
    'if l.total_spent>f.per_txn_limit then raise exception ''Actual spending exceeds the fund transaction limit''; end if;
    if l.total_spent>=f.approval_threshold and l.reimbursement_approved_by is null then',
    'if (l.total_spent>f.per_txn_limit or l.total_spent>=f.approval_threshold) and l.reimbursement_approved_by is null then');
  if fixed = def then raise exception 'Settlement limit checks were not found'; end if;
  execute fixed;
end $$;

-- ------------------------------------------- the approver can see the requests they decide
-- Until now an approver saw only a custodian's own requests. A large request from anyone
-- reaches them once the custodian approved it, and stays visible after they decided it.
drop policy budget_requests_select on public.budget_requests;
create policy budget_requests_select on public.budget_requests for select to authenticated using (
  public.app_role() is not null and (
    requester_id = auth.uid() or public.app_role() in ('admin', 'accounting')
    or (public.app_role() = 'custodian' and public.can_access_fund(fund_id))
    or (public.is_fund_approver(fund_id) and (public.is_fund_custodian_user(fund_id, requester_id) or status = 'awaiting_approver' or approver_id = auth.uid()))
  )
);
do $$
declare def text; fixed text;
begin
  select pg_get_functiondef('public.request_voucher_summary(uuid)'::regprocedure) into def;
  fixed := replace(def, 'or (public.is_fund_approver(r.fund_id) and public.is_fund_custodian_user(r.fund_id, r.requester_id))',
    'or (public.is_fund_approver(r.fund_id) and (public.is_fund_custodian_user(r.fund_id, r.requester_id) or r.status = ''awaiting_approver'' or r.approver_id = auth.uid()))');
  if fixed = def then raise exception 'Request summary access check was not found'; end if;
  execute fixed;
end $$;

-- ------------------------------------------------- the approver's decision
create function public.approve_request_as_approver(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.budget_requests%rowtype; v_role public.user_role; v_name text;
begin
  v_role := public.require_role(array['approver','admin']::public.user_role[]);
  select * into r from public.budget_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'awaiting_approver' then raise exception 'This request is not waiting for an approver'; end if;
  perform public.require_fund_access(r.fund_id);
  if auth.uid() in (r.requester_id, r.reviewed_by) then
    raise exception 'An independent approver must approve this request: not the person who asked for it or the custodian who reviewed it';
  end if;
  if p_approve is null then raise exception 'Choose approve or reject'; end if;
  if not p_approve and nullif(btrim(p_note), '') is null then raise exception 'A rejection reason is required'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.budget_requests set status = case when p_approve then 'approved' else 'rejected' end,
    approver_id = auth.uid(), approver_name = v_name, approver_at = now(), approver_note = nullif(btrim(p_note), '')
  where id = p_id;
end $$;
revoke execute on function public.approve_request_as_approver(uuid, boolean, text) from public, anon;
grant execute on function public.approve_request_as_approver(uuid, boolean, text) to authenticated, service_role;
