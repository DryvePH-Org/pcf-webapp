-- Admin deletion plans are short lived, bound to their creator and rechecked at execution.
create table public.data_deletions (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles(id),
 filters jsonb not null, plan jsonb not null, created_at timestamptz not null default now(),
 executed_at timestamptz
);
create table public.deletion_files (
 bucket text not null check(bucket in ('receipts','liquidation-receipts')), path text not null,
 deletion_id uuid not null references public.data_deletions(id), primary key(bucket,path)
);
alter table public.data_deletions enable row level security;
alter table public.deletion_files enable row level security;
revoke all on public.data_deletions,public.deletion_files from anon,authenticated;
grant all on public.data_deletions,public.deletion_files to service_role;

create function public.plan_data_deletion(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare mode text:=p->>'mode'; f uuid:=nullif(p->>'fund','')::uuid; c uuid:=nullif(p->>'custodian','')::uuid;
 d1 date:=nullif(p->>'from','')::date; d2 date:=nullif(p->>'to','')::date; test boolean:=coalesce((p->>'test')::boolean,false);
 vids uuid[]; lids uuid[]; rids uuid[]; bids uuid[]; files jsonb; result jsonb;
begin
 perform public.require_role(array['admin']::public.user_role[]);
 if mode not in ('reset','transactions','receipts','photos') or mode is null then raise exception 'Invalid deletion type'; end if;
 if d1>d2 then raise exception 'Start date must be before end date'; end if;
 if mode='reset' and (f is not null or c is not null or d1 is not null or d2 is not null or test) then raise exception 'Full reset does not accept filters'; end if;
 select coalesce(array_agg(v.id order by v.id),'{}') into vids from vouchers v join funds x on x.id=v.fund_id
 where (mode='reset' or ((f is null or v.fund_id=f) and (c is null or exists(select 1 from fund_custodians fc where fc.fund_id=v.fund_id and fc.custodian_id=c))
 and (d1 is null or (v.created_at at time zone 'Asia/Manila')::date>=d1) and (d2 is null or (v.created_at at time zone 'Asia/Manila')::date<=d2)
 and (not test or x.name ilike 'E2E TEST%')));
 select coalesce(array_agg(id order by id),'{}') into lids from liquidations where voucher_id=any(vids);
 select coalesce(array_agg(id order by id),'{}') into rids from replenishments where mode='reset' or id in(select replenishment_id from vouchers where id=any(vids));
 if mode='transactions' and exists(select 1 from vouchers where replenishment_id=any(rids) and not(id=any(vids))) then
 raise exception 'Filters split a replenishment cycle. Widen the filters to include every voucher in that cycle.'; end if;
 if mode in ('reset','transactions') and (exists(select 1 from sheet_jobs where liquidation_id=any(lids) and status='pending') or exists(select 1 from sheet_rollovers where replenishment_id=any(rids) and status='pending')) then
 raise exception 'Deliver pending Google Sheets updates before deleting these transactions.'; end if;
 select coalesce(array_agg(b.id order by b.id),'{}') into bids from budget_requests b join funds x on x.id=b.fund_id
 where mode='reset' or ((f is null or b.fund_id=f) and (c is null or exists(select 1 from fund_custodians fc where fc.fund_id=b.fund_id and fc.custodian_id=c))
 and (d1 is null or (b.created_at at time zone 'Asia/Manila')::date>=d1) and (d2 is null or (b.created_at at time zone 'Asia/Manila')::date<=d2)
 and (not test or x.name ilike 'E2E TEST%') and not exists(select 1 from vouchers v where v.budget_request_id=b.id and not(v.id=any(vids))));
 -- Include historical revision and orphan uploads underneath the selected records.
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name) order by bucket_id,name),'[]') into files
 from storage.objects o where (mode='reset' and bucket_id in ('receipts','liquidation-receipts')) or
 (mode in ('receipts','transactions') and bucket_id='liquidation-receipts' and split_part(name,'/',1)=any(lids::text[])) or
 (mode in ('photos','transactions') and bucket_id='receipts' and (split_part(name,'/',2)=any(vids::text[]) or name in(select receipt_path from vouchers where id=any(vids)) or name in(select paper_voucher_path from vouchers where id=any(vids))));
 result:=jsonb_build_object('vouchers',to_jsonb(vids),'liquidations',to_jsonb(lids),'replenishments',to_jsonb(rids),'requests',to_jsonb(bids),'files',files,
 'funds',case when mode='reset' then (select count(*) from funds) else 0 end,'categories',case when mode='reset' then (select count(*) from categories) else 0 end,
 'fingerprint',md5(coalesce((select jsonb_agg(to_jsonb(v) order by id)::text from vouchers v where id=any(vids)),'')||coalesce((select jsonb_agg(to_jsonb(l) order by id)::text from liquidations l where id=any(lids)),'')||coalesce((select jsonb_agg(to_jsonb(i) order by id)::text from liquidation_items i where liquidation_id=any(lids)),'')||coalesce((select jsonb_agg(to_jsonb(r) order by id)::text from replenishments r where id=any(rids)),'')||coalesce((select jsonb_agg(to_jsonb(b) order by id)::text from budget_requests b where id=any(bids)),'')));
 return result;
end $$;

create function public.prepare_data_deletion(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; op uuid;
begin
 result:=public.plan_data_deletion(p);
 insert into data_deletions(actor_id,filters,plan) values(auth.uid(),p,result) returning id into op;
 return jsonb_build_object('id',op,'plan',result);
end $$;

create function public.execute_data_deletion(p_id uuid,p_confirmation text) returns void language plpgsql security definer set search_path=public as $$
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
 update sheet_workbooks set fund_id=null,enabled=false,config_version=config_version+1;
 delete from sheet_expenses;
 delete from notification_log;
 delete from fund_counters;
 delete from fund_custodians;
 delete from funds;
 delete from categories;
 end if;
 update data_deletions set executed_at=now() where id=op.id;
 insert into audit_log(entity_type,entity_id,action,actor_id,new_data) values('data_deletion',op.id,'DELETE',auth.uid(),jsonb_build_object('filters',op.filters,'plan',op.plan));
end $$;
revoke all on function public.plan_data_deletion(jsonb),public.prepare_data_deletion(jsonb),public.execute_data_deletion(uuid,text) from public,anon;
grant execute on function public.prepare_data_deletion(jsonb),public.execute_data_deletion(uuid,text) to authenticated;
