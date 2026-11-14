-- Phase 43: the fund's assigned approver can review a custodian's own liquidation.
-- Until now the assigned approver could handle a custodian's own budget request (phase 39)
-- but not her liquidation, so a fund whose only custodian filed it could be approved only
-- by an administrator. Either the custodian herself (where the fund allows it, phase 40) or
-- the assigned approver can now do it. Administrators still can. Everyone else is unchanged.
-- The approver covers: the receipt review, approving or flagging, the Google Sheets approval
-- (into the custodian's own workbook) and recording the cash settlement.

-- The signed-in user is an approver assigned to this fund, and the owner is one of its custodians.
create function public.approver_reviews_owner(p_fund uuid, p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_fund_approver(p_fund) and public.is_fund_custodian_user(p_fund, p_owner);
$$;
revoke execute on function public.approver_reviews_owner(uuid, uuid) from public, anon;
grant execute on function public.approver_reviews_owner(uuid, uuid) to authenticated, service_role;

do $$
declare def text; fixed text;
  gate constant text := 'if public.app_role()=''approver'' and not public.approver_reviews_owner(l.fund_id,l.owner_id) then raise exception ''Approvers review a custodian''''s own liquidation in the funds they are assigned to''; end if;';
begin
  -- Approve or flag.
  select pg_get_functiondef('public.review_liquidation_before_sheets(uuid,boolean,text)'::regprocedure) into def;
  fixed := replace(def, 'array[''custodian'',''admin'']::public.user_role[]', 'array[''custodian'',''approver'',''admin'']::public.user_role[]');
  if fixed = def then raise exception 'Review role list was not found'; end if;
  def := fixed;
  fixed := replace(def, 'perform public.require_fund_access(l.fund_id);', 'perform public.require_fund_access(l.fund_id); ' || gate);
  if fixed = def then raise exception 'Review fund check was not found'; end if;
  execute fixed;

  -- The receipt review.
  select pg_get_functiondef('public.save_custodian_receipts(uuid,integer,jsonb)'::regprocedure) into def;
  fixed := replace(def, 'array[''admin'',''custodian'']::public.user_role[]', 'array[''admin'',''custodian'',''approver'']::public.user_role[]');
  if fixed = def then raise exception 'Receipt review role list was not found'; end if;
  def := fixed;
  fixed := replace(def, 'perform public.require_fund_access(l.fund_id);', 'perform public.require_fund_access(l.fund_id); ' || gate);
  if fixed = def then raise exception 'Receipt review fund check was not found'; end if;
  execute fixed;

  -- Recording the cash settlement.
  select pg_get_functiondef('public.record_liquidation_settlement(uuid,numeric,text)'::regprocedure) into def;
  fixed := replace(def, 'array[''custodian'',''admin'']::public.user_role[]', 'array[''custodian'',''approver'',''admin'']::public.user_role[]');
  if fixed = def then raise exception 'Settlement role list was not found'; end if;
  def := fixed;
  fixed := replace(def, 'perform public.require_fund_access(l.fund_id);', 'perform public.require_fund_access(l.fund_id); ' || gate);
  if fixed = def then raise exception 'Settlement fund check was not found'; end if;
  execute fixed;

  -- The expense types shown during the review come from the fund's workbook.
  select pg_get_functiondef('public.list_custodian_tags(uuid)'::regprocedure) into def;
  fixed := replace(def, 'array[''admin'',''custodian'']::public.user_role[]', 'array[''admin'',''custodian'',''approver'']::public.user_role[]');
  if fixed = def then raise exception 'Tag list role list was not found'; end if;
  def := fixed;
  fixed := replace(def, 'where fund_id=p_fund and custodian_id=auth.uid()', 'where fund_id=p_fund and (custodian_id=auth.uid() or (public.app_role()=''approver'' and public.is_fund_approver(p_fund)))');
  if fixed = def then raise exception 'Tag list workbook lookup was not found'; end if;
  execute fixed;

  -- The Google Sheets approval: the workbook belongs to the custodian who owns the liquidation.
  select pg_get_functiondef('public.approve_liquidation_with_sheet_legacy(uuid)'::regprocedure) into def;
  fixed := replace(def, 'w.custodian_id is distinct from auth.uid()',
    '(w.custodian_id is distinct from auth.uid() and not (public.app_role()=''approver'' and public.approver_reviews_owner(w.fund_id,(select x.owner_id from public.liquidations x where x.id=p.liquidation_id))))');
  if fixed = def then raise exception 'Sheet approval workbook check was not found'; end if;
  execute fixed;
end $$;

-- Photographing the physical receipts during the review.
drop policy liquidation_custodian_receipt_upload on storage.objects;
create policy liquidation_custodian_receipt_upload on storage.objects for insert to authenticated with check(
 bucket_id='liquidation-receipts' and exists(select 1 from public.liquidations l where l.id::text=split_part(name,'/',1)
 and l.status='submitted' and (l.owner_id<>auth.uid() or public.self_approval_allowed(l.fund_id,l.owner_id))
 and ((public.app_role() in ('admin','custodian') and public.can_access_fund(l.fund_id))
      or (public.app_role()='approver' and public.approver_reviews_owner(l.fund_id,l.owner_id))))
);
