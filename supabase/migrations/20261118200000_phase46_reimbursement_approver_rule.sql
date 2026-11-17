-- Phase 46: any approver (or administrator) can approve an extra reimbursement, except the employee
-- who is being paid. Before, the custodian who approved the liquidation and the person who prepared
-- the voucher were also shut out. For a custodian's own liquidation the fund's assigned approver is
-- the one who reviews it (phase 43), so that rule locked the approver out of the reimbursement and
-- only an administrator could approve it.

do $$
declare def text; fixed text;
begin
  select pg_get_functiondef('public.approve_liquidation_reimbursement(uuid)'::regprocedure) into def;
  fixed := replace(def,
    'if auth.uid() in (l.owner_id,l.reviewed_by,v.prepared_by) then raise exception ''An independent approver must approve this reimbursement''; end if;',
    'if auth.uid() = l.owner_id then raise exception ''You cannot approve a reimbursement that is paid to you''; end if;');
  if fixed = def then raise exception 'Reimbursement independence check was not found'; end if;
  execute fixed;
end $$;
