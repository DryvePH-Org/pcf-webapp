-- Phase 40: per-fund setting that lets a custodian approve her own budget
-- request and liquidation. Every self-approval is written to the audit log.
-- The default is off, so no fund changes until an administrator turns it on.
-- Funds that stay off keep the earlier rules (another custodian, or the fund's
-- assigned approver from phase 39, handles a custodian's own request).
-- Approval limits are not relaxed: a voucher at or above the fund's approval
-- limit still needs an approver, and an extra reimbursement still needs an
-- independent approver.

alter table public.funds add column custodian_self_approval boolean not null default false;

-- ------------------------------------------------------------------ helpers
-- True when this user is a custodian of the fund and the fund allows it.
create function public.self_approval_allowed(p_fund uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select f.custodian_self_approval from public.funds f where f.id = p_fund), false)
     and public.is_fund_custodian_user(p_fund, p_user);
$$;

create function public.audit_self_approval(p_entity text, p_id uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(entity_type, entity_id, action, actor_id, new_data)
    values (p_entity, p_id, 'self_approval', auth.uid(), p_data);
end $$;

revoke execute on function public.self_approval_allowed(uuid, uuid), public.audit_self_approval(text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.self_approval_allowed(uuid, uuid) to authenticated, service_role;
grant execute on function public.audit_self_approval(text, uuid, jsonb) to service_role;

-- An administrator turns it on or off per fund (and the change is audited).
create function public.set_fund_self_approval(p_fund_id uuid, p_allowed boolean) returns void
language plpgsql security definer set search_path = public as $$
declare before boolean;
begin
  perform public.require_role(array['admin']::public.user_role[]);
  if p_allowed is null then raise exception 'Choose on or off'; end if;
  select custodian_self_approval into before from public.funds where id = p_fund_id for update;
  if not found then raise exception 'Fund not found'; end if;
  update public.funds set custodian_self_approval = p_allowed where id = p_fund_id;
  insert into public.audit_log(entity_type, entity_id, action, actor_id, old_data, new_data)
    values ('funds', p_fund_id, 'update', auth.uid(),
      jsonb_build_object('custodian_self_approval', before), jsonb_build_object('custodian_self_approval', p_allowed));
end $$;
revoke execute on function public.set_fund_self_approval(uuid, boolean) from public, anon;
grant execute on function public.set_fund_self_approval(uuid, boolean) to authenticated, service_role;

-- With self-approval on, the approver gateway of phase 39 is not forced.
create or replace function public.request_needs_fund_approver(p_fund uuid, p_requester uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_fund_custodian_user(p_fund, p_requester) and public.fund_has_approver(p_fund)
     and not public.self_approval_allowed(p_fund, p_requester);
$$;

-- Which funds allow it, for the request form and pages.
create function public.fund_self_approval_flags() returns table(fund_id uuid, allowed boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_role(array['admin','custodian','approver','accounting','requester']::public.user_role[]);
  return query select f.id, f.custodian_self_approval from public.funds f;
end $$;
revoke execute on function public.fund_self_approval_flags() from public, anon;
grant execute on function public.fund_self_approval_flags() to authenticated, service_role;

-- --------------------------------------------------------- budget requests
create or replace function public.review_budget_request(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.budget_requests%rowtype; v_role public.user_role; v_name text; v_self boolean;
begin
  v_role := public.require_role(array['custodian','approver','admin']::public.user_role[]);
  select * into r from public.budget_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'submitted' then raise exception 'Only submitted requests can be reviewed'; end if;
  v_self := r.requester_id = auth.uid();
  if v_self and not public.self_approval_allowed(r.fund_id, r.requester_id) then
    raise exception 'You cannot review your own request';
  end if;
  perform public.require_fund_access(r.fund_id);
  if not v_self and v_role = 'approver' and not (public.is_fund_approver(r.fund_id) and public.is_fund_custodian_user(r.fund_id, r.requester_id)) then
    raise exception 'Approvers review a custodian''s own request in the funds they are assigned to';
  end if;
  if not v_self and v_role = 'custodian' and public.request_needs_fund_approver(r.fund_id, r.requester_id) then
    raise exception 'This is a custodian''s own request. The fund''s assigned approver reviews it';
  end if;
  if p_approve is null then raise exception 'Choose approve or reject'; end if;
  if not p_approve and nullif(btrim(p_note), '') is null then raise exception 'A rejection reason is required'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.budget_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewer_name = v_name, reviewed_at = now(), review_note = nullif(btrim(p_note), '') where id = p_id;
  if v_self then
    perform public.audit_self_approval('budget_requests', r.id, jsonb_build_object(
      'step', 'request_review', 'decision', case when p_approve then 'approved' else 'rejected' end,
      'amount', r.amount, 'fund_id', r.fund_id));
  end if;
end $$;

create or replace function public.create_voucher_from_request(
  p_request_id uuid, p_items jsonb, p_voucher_date date default current_date, p_no_receipt_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare r public.budget_requests%rowtype; v_id uuid; v_total numeric; v_role public.user_role; v_self boolean;
begin
  v_role := public.require_role(array['custodian','approver','admin']::public.user_role[]);
  select * into r from public.budget_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'approved' then raise exception 'Approve this request before creating its voucher'; end if;
  v_self := r.requester_id = auth.uid();
  if v_self and not public.self_approval_allowed(r.fund_id, r.requester_id) then
    raise exception 'Another person must prepare your requested voucher';
  end if;
  perform public.require_fund_access(r.fund_id);
  if not v_self and v_role = 'approver' and not (public.is_fund_approver(r.fund_id) and public.is_fund_custodian_user(r.fund_id, r.requester_id)) then
    raise exception 'Approvers prepare the voucher for a custodian''s own request in the funds they are assigned to';
  end if;
  if not v_self and v_role = 'custodian' and public.request_needs_fund_approver(r.fund_id, r.requester_id) then
    raise exception 'This is a custodian''s own request. The fund''s assigned approver prepares its voucher';
  end if;
  v_id := public.create_voucher_lines(r.fund_id, r.requester_name, p_items, p_voucher_date, null, p_no_receipt_reason);
  select amount into v_total from public.vouchers where id = v_id;
  if v_total > r.amount then raise exception 'Voucher total exceeds the approved budget'; end if;
  update public.vouchers set budget_request_id = r.id where id = v_id;
  update public.budget_requests set status = 'voucher_created' where id = r.id;
  if v_self then
    perform public.audit_self_approval('vouchers', v_id, jsonb_build_object(
      'step', 'voucher_prepared', 'request_id', r.id, 'amount', v_total, 'fund_id', r.fund_id));
  end if;
  return v_id;
end $$;

-- Cash for a request is not released by the person who asked for it, unless the fund allows it.
create or replace function public.block_self_release() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.released_at is not null and old.released_at is null and new.budget_request_id is not null
     and exists (select 1 from public.budget_requests r where r.id = new.budget_request_id and r.requester_id = auth.uid()) then
    if not public.self_approval_allowed(new.fund_id, auth.uid()) then
      raise exception 'Another person must release the cash for your own request';
    end if;
    perform public.audit_self_approval('vouchers', new.id, jsonb_build_object(
      'step', 'cash_released', 'amount', new.amount, 'fund_id', new.fund_id));
  end if;
  return new;
end $$;

-- -------------------------------------------------------------- liquidation
do $$
declare def text; fixed text;
begin
  -- Review (approve or flag).
  select pg_get_functiondef('public.review_liquidation_before_sheets(uuid,boolean,text)'::regprocedure) into def;
  fixed := replace(def,
    'if l.owner_id=auth.uid() then raise exception ''You cannot review your own liquidation''; end if;',
    'if l.owner_id=auth.uid() then if not public.self_approval_allowed(l.fund_id,l.owner_id) then raise exception ''You cannot review your own liquidation''; end if; perform public.audit_self_approval(''liquidations'',l.id,jsonb_build_object(''step'',''liquidation_review'',''decision'',case when p_approve then ''approved'' else ''flagged'' end,''fund_id'',l.fund_id,''total_spent'',l.total_spent)); end if;');
  if fixed = def then raise exception 'Liquidation review owner check was not found'; end if;
  execute fixed;

  -- The custodian's receipt review.
  select pg_get_functiondef('public.save_custodian_receipts(uuid,integer,jsonb)'::regprocedure) into def;
  fixed := replace(def,
    'or l.owner_id=auth.uid() then raise exception ''Another custodian must review a submitted liquidation'';',
    'or (l.owner_id=auth.uid() and not public.self_approval_allowed(l.fund_id,l.owner_id)) then raise exception ''Another custodian must review a submitted liquidation'';');
  if fixed = def then raise exception 'Receipt review owner check was not found'; end if;
  execute fixed;

  -- Recording the cash settlement.
  select pg_get_functiondef('public.record_liquidation_settlement(uuid,numeric,text)'::regprocedure) into def;
  fixed := replace(def,
    'if l.owner_id=auth.uid() then raise exception ''Another custodian must record your settlement''; end if;',
    'if l.owner_id=auth.uid() then if not public.self_approval_allowed(l.fund_id,l.owner_id) then raise exception ''Another custodian must record your settlement''; end if; perform public.audit_self_approval(''liquidations'',l.id,jsonb_build_object(''step'',''settlement_recorded'',''fund_id'',l.fund_id,''amount'',p_amount)); end if;');
  if fixed = def then raise exception 'Settlement owner check was not found'; end if;
  execute fixed;
end $$;

-- A custodian reviewing her own liquidation may photograph the physical receipts too.
drop policy liquidation_custodian_receipt_upload on storage.objects;
create policy liquidation_custodian_receipt_upload on storage.objects for insert to authenticated with check(
 bucket_id='liquidation-receipts' and exists(select 1 from public.liquidations l where l.id::text=split_part(name,'/',1)
 and l.status='submitted' and (l.owner_id<>auth.uid() or public.self_approval_allowed(l.fund_id,l.owner_id))
 and public.app_role() in ('admin','custodian') and public.can_access_fund(l.fund_id))
);
