-- Supabase safeupdate requires an explicit predicate even for an intentional full reset.
create or replace function public.execute_data_deletion(p_id uuid,p_confirmation text) returns void language plpgsql security definer set search_path=public as $$
declare op public.data_deletions; vids uuid[]; lids uuid[]; rids uuid[]; bids uuid[]; mode text;
begin
 perform public.require_role(array['admin']::public.user_role[]);
 select * into op from data_deletions where id=p_id and actor_id=auth.uid() for update;
 if not found then raise exception 'Deletion preview not found'; end if;
 if op.executed_at is not null then return; end if;
 if op.created_at<now()-interval '10 minutes' then raise exception 'Preview expired. Preview again.'; end if;
 mode:=op.filters->>'mode';
 if p_confirmation is distinct from (case when mode='reset' then 'DELETE ALL APP DATA' else 'DELETE SELECTED DATA' end) then raise exception 'Confirmation text does not match'; end if;
 lock table vouchers,liquidations,liquidation_items,liquidation_revisions,cash_settlements,replenishments,replenishment_items,budget_requests,sheet_jobs,sheet_previews,sheet_rollovers,funds,categories,fund_custodians in share row exclusive mode;
 if public.plan_data_deletion(op.filters)<>op.plan then raise exception 'Data changed since preview. Preview again.'; end if;
 select array(select jsonb_array_elements_text(op.plan->'vouchers')::uuid) into vids;
 select array(select jsonb_array_elements_text(op.plan->'liquidations')::uuid) into lids;
 select array(select jsonb_array_elements_text(op.plan->'replenishments')::uuid) into rids;
 select array(select jsonb_array_elements_text(op.plan->'requests')::uuid) into bids;
 insert into deletion_files(bucket,path,deletion_id) select x->>'bucket',x->>'path',op.id from jsonb_array_elements(op.plan->'files') x on conflict do nothing;
 if mode in ('reset','transactions') then
 delete from sheet_jobs where liquidation_id=any(lids);
 delete from sheet_previews where liquidation_id=any(lids);
 delete from sheet_rollovers where replenishment_id=any(rids);
 delete from replenishment_items where voucher_id=any(vids) or replenishment_id=any(rids);
 delete from cash_settlements where voucher_id=any(vids);
 delete from liquidation_revisions where liquidation_id=any(lids);
 delete from liquidation_items where liquidation_id=any(lids);
 delete from liquidations where id=any(lids);
 delete from vouchers where id=any(vids);
 delete from replenishments where id=any(rids);
 delete from budget_requests where id=any(bids);
 elsif mode='receipts' then
 update liquidation_items set receipt_path=null,no_receipt_reason='Attachment removed by administrator' where liquidation_id=any(lids) and receipt_path is not null;
 -- Historical snapshots must not retain working attachment links after removal.
 update liquidation_revisions set payload=jsonb_set(payload,'{items}',coalesce((select jsonb_agg((x - 'receipt_path') || jsonb_build_object('receipt_path',null,'no_receipt_reason','Attachment removed by administrator')) from jsonb_array_elements(payload->'items') x),'[]')) where liquidation_id=any(lids) and jsonb_typeof(payload->'items')='array';
 elsif mode='photos' then
 update vouchers set receipt_path=null,paper_voucher_path=null,no_receipt_reason='Attachment removed by administrator' where id=any(vids) and (receipt_path is not null or paper_voucher_path is not null);
 end if;
 if mode='reset' then
 update sheet_workbooks set fund_id=null,enabled=false,config_version=config_version+1 where id is not null;
 delete from sheet_expenses where book_id is not null;
 delete from notification_log where id is not null;
 delete from fund_counters where fund_id is not null;
 delete from fund_custodians where fund_id is not null;
 delete from funds where id is not null;
 delete from categories where id is not null;
 end if;
 update data_deletions set executed_at=now() where id=op.id;
 insert into audit_log(entity_type,entity_id,action,actor_id,new_data) values('data_deletion',op.id,'DELETE',auth.uid(),jsonb_build_object('filters',op.filters,'plan',op.plan));
end $$;
