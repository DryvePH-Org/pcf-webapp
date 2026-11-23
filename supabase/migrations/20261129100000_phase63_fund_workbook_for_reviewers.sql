-- Phase 63: a liquidation is reviewed against the fund's workbook by any custodian of that fund, or an administrator.
--
-- Until now the approval and the list of tags only worked for the one custodian the workbook is assigned to. A
-- liquidation filed by that custodian could then not be approved by anyone else ("Ask Accounting to enable a workbook
-- for your custodian, fund, and active worksheet"), and an administrator or another custodian saw an empty tag list.
-- The workbook still belongs to its assigned custodian for replenishments; only the review is widened, and only to
-- people who already have access to the fund (an administrator, or a custodian assigned to that fund).

do $$
declare def text; fixed text;
begin
  select pg_get_functiondef('public.approve_liquidation_with_sheet_legacy(uuid)'::regprocedure) into def;
  fixed := replace(def, 'w.custodian_id is distinct from auth.uid() and not (public.app_role()=''approver''',
    'w.custodian_id is distinct from auth.uid() and not (public.app_role() in (''admin'',''custodian'') and public.can_access_fund(w.fund_id)) and not (public.app_role()=''approver''');
  if fixed = def then raise exception 'Sheet approval workbook check was not found'; end if;
  execute fixed;

  select pg_get_functiondef('public.list_custodian_tags(uuid)'::regprocedure) into def;
  fixed := replace(def, 'where fund_id=p_fund and (custodian_id=auth.uid() or (',
    'where fund_id=p_fund and (custodian_id=auth.uid() or public.app_role() in (''admin'',''custodian'') or (');
  if fixed = def then raise exception 'Tag list workbook lookup was not found'; end if;
  -- the workbook that is switched on comes first
  execute fixed;
end $$;
