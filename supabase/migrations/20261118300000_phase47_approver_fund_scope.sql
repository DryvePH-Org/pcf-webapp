-- Phase 47: an approver can approve anything in the funds they are assigned to, and only there.
-- Before: an approver could act on a custodian's own items (request, liquidation, settlement), but
-- not on an employee's, and some approvals (voucher, reimbursement, replenishment) were open to an
-- approver of ANY fund. Now one rule applies everywhere:
--   an approver acts on anyone's items except their own, in the funds they are assigned to; a fund
--   with no assigned approver can be handled by any approver, so nothing gets stuck.
-- Administrators still act everywhere. Custodians keep what they had.

-- The one rule.
create function public.approver_acts_in(p_fund uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'approver' and (
    exists (select 1 from public.fund_approvers where fund_id = p_fund and approver_id = auth.uid())
    or not public.fund_has_approver(p_fund)
  ), false);
$$;
revoke execute on function public.approver_acts_in(uuid) from public, anon;
grant execute on function public.approver_acts_in(uuid) to authenticated, service_role;

-- Everything that asked "is this approver the one for this owner's item" (receipt review, approving or
-- flagging a liquidation, the Google Sheets approval, recording the settlement, cancelling an advance)
-- now asks the one rule. An approver never acts on their own item.
create or replace function public.approver_reviews_owner(p_fund uuid, p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.approver_acts_in(p_fund) and p_owner <> auth.uid();
$$;

-- Requests: an approver sees and reviews every request in their funds.
drop policy budget_requests_select on public.budget_requests;
create policy budget_requests_select on public.budget_requests for select to authenticated using (
  public.app_role() is not null and (
    requester_id = auth.uid() or public.app_role() in ('admin', 'accounting')
    or (public.app_role() = 'custodian' and public.can_access_fund(fund_id))
    or public.approver_acts_in(fund_id)
  )
);

do $$
declare def text; fixed text; signature text;
begin
  -- Approving, returning and flagging a voucher: only in the approver's own funds.
  foreach signature in array array['public.approve_voucher(uuid)', 'public.return_voucher(uuid,text)', 'public.reject_voucher(uuid,text)'] loop
    select pg_get_functiondef(signature::regprocedure) into def;
    fixed := replace(def, 'raise exception ''Voucher not found'';
  end if;',
      'raise exception ''Voucher not found'';
  end if;
  if public.app_role() = ''approver'' and not public.approver_acts_in(v_voucher.fund_id) then
    raise exception ''You are not an approver of this fund'';
  end if;');
    if fixed = def then raise exception 'Voucher lookup was not found in %', signature; end if;
    execute fixed;
  end loop;
  select pg_get_functiondef('public.request_voucher_summary(uuid)'::regprocedure) into def;
  fixed := replace(def, 'or (public.is_fund_approver(r.fund_id) and (public.is_fund_custodian_user(r.fund_id, r.requester_id) or r.status = ''awaiting_approver'' or r.approver_id = auth.uid()))',
    'or public.approver_acts_in(r.fund_id)');
  if fixed = def then raise exception 'Request summary access check was not found'; end if;
  execute fixed;

  -- First review of a request: any request in the approver's funds, not only a custodian's own.
  select pg_get_functiondef('public.review_budget_request(uuid,boolean,text)'::regprocedure) into def;
  fixed := replace(def,
    'if not v_self and v_role = ''approver'' and not (public.is_fund_approver(r.fund_id) and public.is_fund_custodian_user(r.fund_id, r.requester_id)) then
    raise exception ''Approvers review a custodian''''s own request in the funds they are assigned to'';',
    'if not v_self and v_role = ''approver'' and not public.approver_acts_in(r.fund_id) then
    raise exception ''You are not an approver of this fund'';');
  if fixed = def then raise exception 'Approver request review check was not found'; end if;
  execute fixed;

  -- The approver's step on a large request.
  select pg_get_functiondef('public.approve_request_as_approver(uuid,boolean,text)'::regprocedure) into def;
  fixed := replace(def, 'perform public.require_fund_access(r.fund_id);',
    'perform public.require_fund_access(r.fund_id);
  if v_role = ''approver'' and not public.approver_acts_in(r.fund_id) then raise exception ''You are not an approver of this fund''; end if;');
  if fixed = def then raise exception 'Approver step fund check was not found'; end if;
  execute fixed;

  -- The extra reimbursement.
  select pg_get_functiondef('public.approve_liquidation_reimbursement(uuid)'::regprocedure) into def;
  fixed := replace(def, 'if auth.uid() = l.owner_id then',
    'if public.app_role() = ''approver'' and not public.approver_acts_in(l.fund_id) then raise exception ''You are not an approver of this fund''; end if;
  if auth.uid() = l.owner_id then');
  if fixed = def then raise exception 'Reimbursement owner check was not found'; end if;
  execute fixed;

  -- The replenishment.
  select pg_get_functiondef('public.approve_replenishment(uuid,boolean,text)'::regprocedure) into def;
  fixed := replace(def, 'if auth.uid() in (r.requested_by,r.reviewed_by) then',
    'if public.app_role() = ''approver'' and not public.approver_acts_in(r.fund_id) then raise exception ''You are not an approver of this fund''; end if;
 if auth.uid() in (r.requested_by,r.reviewed_by) then');
  if fixed = def then raise exception 'Replenishment independence check was not found'; end if;
  execute fixed;
end $$;
