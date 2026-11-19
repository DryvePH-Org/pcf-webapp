-- Phase 49: a budget request an approver approved can become a voucher above the per-transaction limit.
-- The limit is the cap on what a custodian may release alone. Once an approver (or an administrator)
-- has approved a request for an amount, the voucher for that request may use up to that approved
-- amount, so an approved request is never stuck at "Amount exceeds the per-transaction limit".
-- Also: the page and the database now agree on who prepares a voucher. An approver prepares one only
-- for a custodian's own request in the funds they are assigned to; everyone else's goes to a custodian.

-- True when this approved request, cleared by an approver or administrator, covers the total.
create function public.voucher_limit_cleared(p_total numeric, p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.status in ('approved', 'voucher_created') and r.amount >= p_total
       and (r.approver_id is not null
            or exists (select 1 from public.profiles p where p.id = r.reviewed_by and p.role in ('approver', 'admin')))
    from public.budget_requests r where r.id = p_request
  ), false);
$$;
revoke execute on function public.voucher_limit_cleared(numeric, uuid) from public, anon, authenticated;
grant execute on function public.voucher_limit_cleared(numeric, uuid) to service_role;

-- The assigned approver preparing a voucher for one of the fund's own custodians (the rule the database enforces).
create function public.approver_prepares_owner(p_fund uuid, p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_fund_approver(p_fund) and public.is_fund_custodian_user(p_fund, p_owner);
$$;
revoke execute on function public.approver_prepares_owner(uuid, uuid) from public, anon;
grant execute on function public.approver_prepares_owner(uuid, uuid) to authenticated, service_role;

do $$
declare def text; fixed text; check_text constant text := 'if v_total > v_fund.per_txn_limit then';
begin
  -- Saving a voucher from an approved request: tell the line check which request this is.
  select pg_get_functiondef('public.create_voucher_from_request(uuid,jsonb,date,text)'::regprocedure) into def;
  fixed := replace(def, 'v_id := public.create_voucher_lines(',
    E'perform set_config(''pcf.voucher_request'', r.id::text, true);\n  v_id := public.create_voucher_lines(');
  if fixed = def then raise exception 'Voucher creation call was not found'; end if;
  execute fixed;

  -- The limit check on a new voucher.
  select pg_get_functiondef(p.oid) into def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'create_voucher_lines';
  fixed := replace(def, check_text,
    'if v_total > v_fund.per_txn_limit and not public.voucher_limit_cleared(v_total, nullif(current_setting(''pcf.voucher_request'', true), '''')::uuid) then');
  if fixed = def then raise exception 'Voucher limit check was not found'; end if;
  execute fixed;

  -- The limit check when a draft is edited.
  select pg_get_functiondef(p.oid) into def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'update_voucher_lines';
  fixed := replace(def, check_text,
    'if v_total > v_fund.per_txn_limit and not public.voucher_limit_cleared(v_total, v_voucher.budget_request_id) then');
  if fixed = def then raise exception 'Draft limit check was not found'; end if;
  execute fixed;
end $$;
