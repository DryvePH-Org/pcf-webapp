alter table public.replenishments add column approver_id uuid references public.profiles(id);
alter table public.replenishments add column approver_approved_at timestamptz;
alter table public.replenishments add column paid_by uuid references public.profiles(id);
alter table public.replenishments add column paid_at timestamptz;
-- Existing open accounting approvals must also pass the newly required approval stage.
update public.replenishments set status='accounting_approved' where status='approved';

create or replace function public.review_replenishment(p_id uuid,p_approve boolean,p_note text default null) returns void
language plpgsql security definer set search_path=public as $$
declare r public.replenishments;
begin
 perform public.require_role(array['accounting','admin']::public.user_role[]);
 perform 1 from public.funds where id=(select fund_id from public.replenishments where id=p_id) for update;
 select * into r from public.replenishments where id=p_id for update;
 if not found or r.status not in ('submitted','accounting_approved','approved') then raise exception 'This replenishment cannot be reviewed'; end if;
 if p_approve is null or (not p_approve and nullif(btrim(p_note),'') is null) then raise exception 'A rejection reason is required'; end if;
 if p_approve and r.status<>'submitted' then raise exception 'Accounting has already reviewed this request'; end if;
 if p_approve and r.requested_by=auth.uid() then raise exception 'Another accountant must review your request'; end if;
 perform 1 from public.vouchers where replenishment_id=p_id order by id for update;
 if p_approve then perform public.validate_replenishment(p_id); end if;
 update public.replenishments set status=(case when p_approve then 'accounting_approved' else 'rejected' end)::public.replenishment_status,
 reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(p_note),''),approver_id=null,approver_approved_at=null where id=p_id;
 if not p_approve then update public.vouchers set replenishment_id=null where replenishment_id=p_id; end if;
end $$;

create function public.approve_replenishment(p_id uuid,p_approve boolean,p_note text default null) returns void
language plpgsql security definer set search_path=public as $$
declare r public.replenishments;
begin
 perform public.require_role(array['approver','admin']::public.user_role[]);
 perform 1 from public.funds where id=(select fund_id from public.replenishments where id=p_id) for update;
 select * into r from public.replenishments where id=p_id for update;
 if not found or r.status<>'accounting_approved' or r.reviewed_by is null then raise exception 'Accounting must review the replenishment first'; end if;
 if auth.uid() in (r.requested_by,r.reviewed_by) then raise exception 'An independent approver must approve this replenishment'; end if;
 if p_approve is null or (not p_approve and nullif(btrim(p_note),'') is null) then raise exception 'A reason is required to return the request'; end if;
 perform 1 from public.vouchers where replenishment_id=p_id order by id for update;
 perform public.validate_replenishment(p_id);
 update public.replenishments set status=(case when p_approve then 'approved' else 'rejected' end)::public.replenishment_status,
 approver_id=case when p_approve then auth.uid() else null end,approver_approved_at=case when p_approve then now() else null end,
 review_note=case when p_approve then review_note else btrim(p_note) end where id=p_id;
 if not p_approve then update public.vouchers set replenishment_id=null where replenishment_id=p_id; end if;
end $$;
revoke all on function public.approve_replenishment(uuid,boolean,text) from public,anon;
grant execute on function public.approve_replenishment(uuid,boolean,text) to authenticated;

alter function public.close_replenishment(uuid) rename to close_replenishment_before_approver;
revoke all on function public.close_replenishment_before_approver(uuid) from public,anon,authenticated;
create function public.close_replenishment(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare r public.replenishments;
begin
 perform public.require_role(array['accounting','admin']::public.user_role[]);
 perform 1 from public.funds where id=(select fund_id from public.replenishments where id=p_id) for update;
 select * into r from public.replenishments where id=p_id for update;
 if not found or r.status<>'approved' or r.approver_id is null or r.approver_approved_at is null then raise exception 'The approver must approve before Accounting records cash handover'; end if;
 perform public.close_replenishment_before_approver(p_id);
 update public.replenishments set paid_by=auth.uid(),paid_at=now() where id=p_id;
end $$;
revoke all on function public.close_replenishment(uuid) from public,anon;
grant execute on function public.close_replenishment(uuid) to authenticated;

-- Receipt-only deletion invalidates custodian review and all prepared previews.
do $$ declare definition text; begin
 select pg_get_functiondef('public.execute_data_deletion(uuid,text)'::regprocedure) into definition;
 definition:=replace(definition,'elsif mode=''receipts'' then',E'elsif mode=''receipts'' then\n update public.liquidation_receipt_lines set receipt_path=null where liquidation_id=any(lids);\n update public.liquidations set receipt_reviewed_by=null,receipt_review_revision=receipt_review_revision+1 where id=any(lids) and status<>''approved'';');
 execute definition;
end $$;

-- Approvers need read access to the same replenishment context as Accounting.
do $$ declare definition text; begin
 select pg_get_functiondef('public.replenishment_fund_options()'::regprocedure) into definition;
 definition:=replace(definition,'array[''custodian'',''admin'',''accounting'']', 'array[''custodian'',''admin'',''accounting'',''approver'']');
 execute definition;
end $$;
