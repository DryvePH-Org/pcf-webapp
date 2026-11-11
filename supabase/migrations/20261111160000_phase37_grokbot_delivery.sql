-- Durable Grokbot delivery replaces the synchronous Google script bridge.
drop index public.grokbot_one_active_destination;
alter table public.grokbot_operations
 drop constraint grokbot_operations_kind_check,
 add constraint grokbot_operations_kind_check check(kind in ('reference_audit','integration_test','liquidation_approved','replenishment_approved','workbook_refresh')),
 add column runner_id uuid;
create unique index grokbot_one_running_destination on public.grokbot_operations(spreadsheet_id,sheet_id) where status='running';
create unique index grokbot_liquidation_once on public.grokbot_operations(liquidation_id);
create unique index grokbot_replenishment_once on public.grokbot_operations(replenishment_id);
create unique index grokbot_one_webapp_simulation on public.grokbot_operations((payload->>'source'))
where kind='integration_test' and status in ('queued','running') and payload->>'source'='webapp-simulation';
alter table public.sheet_workbooks add column replenishment_sequence int not null default 0 check(replenishment_sequence>=0);

create function public.queue_grokbot_replenishment(p_id uuid,p_operation uuid,p_hash text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.replenishments; existing uuid; previous_number int; custodian text;
begin
 perform pg_advisory_xact_lock(hashtextextended('grokbot-buying-replenishment',0));
 select id into existing from grokbot_operations where replenishment_id=p_id;
 if existing is not null then return existing; end if;
 select * into r from replenishments where id=p_id for share;
 if not found or r.status not in ('approved','closed') or r.reviewed_by is null or r.reviewed_at is null or r.approver_id is null or r.approver_approved_at is null or r.reviewed_by=r.approver_id then
  raise exception 'Accounting and an independent Approver must approve first';
 end if;
 perform 1 from sheet_workbooks where id='buying' and enabled and fund_id=r.fund_id and custodian_id=r.requested_by
  and spreadsheet_id='1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk' and active_sheet_id=1042918180 for share;
 if not found then raise exception 'Assign this custodian and fund to the Buying workbook first'; end if;
 select full_name into custodian from profiles where id=r.requested_by;
 select replenishment_sequence into previous_number from sheet_workbooks where id='buying' for update;
 update sheet_workbooks set replenishment_sequence=previous_number+1 where id='buying';
 insert into grokbot_operations(id,kind,spreadsheet_id,sheet_id,callback_hash,replenishment_id,expires_at,payload)
 values(p_operation,'replenishment_approved','1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk',1042918180,p_hash,p_id,now()+interval '2 hours',
  jsonb_build_object('protocol_version','pcf.grokbot.v1','operation_id',p_operation,'event','pcf.replenishment.approved',
   'target',jsonb_build_object('spreadsheet_id','1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk','sheet_id',1042918180,'sheet_title','PCF REPLENISHMENT - BUYING (NOV-DEC 2026)'),
   'replenishment_id',p_id,'replenishment_number',previous_number+1,'expected_previous_replenishment_number',previous_number,
   'approved_amount',r.total::text,'accounting_approved_at',to_char(r.reviewed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'approver_approved_at',to_char(r.approver_approved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'accounting_id',r.reviewed_by,'approver_id',r.approver_id,'custodian_name',custodian,
   'approval_date',(r.approver_approved_at at time zone 'Asia/Manila')::date::text));
 return p_operation;
end $$;

create function public.claim_grokbot_dispatch() returns setof public.grokbot_operations
language plpgsql security definer set search_path=public as $$
declare operation uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('grokbot-buying-dispatch',0));
 if exists(select 1 from grokbot_operations where status='running') then return; end if;
 select id into operation from grokbot_operations where status='queued' order by created_at,id limit 1 for update;
 if operation is null then return; end if;
 return query update grokbot_operations set status='running',updated_at=now() where id=operation returning *;
end $$;

create function public.claim_grokbot_runner(p_id uuid,p_runner uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 update grokbot_operations set runner_id=p_runner where id=p_id and status='running' and (runner_id is null or runner_id=p_runner);
 return found;
end $$;

create function public.record_grokbot_result(p_id uuid,p_runner uuid,p_status text,p_report jsonb,p_error text) returns void
language plpgsql security definer set search_path=public as $$
declare operation public.grokbot_operations;
begin
 select * into operation from grokbot_operations where id=p_id for update;
 if not found then raise exception 'Operation missing'; end if;
 if operation.status in ('completed','blocked','failed') then return; end if;
 if operation.runner_id is distinct from p_runner then raise exception 'Runner ownership changed'; end if;
 if p_status not in ('running','completed','blocked','failed') then raise exception 'Invalid status'; end if;
 update grokbot_operations set status=p_status,report=p_report,error=p_error,updated_at=now() where id=p_id;
 if operation.liquidation_id is not null then
  update sheet_jobs set status=case when p_status='completed' then 'synced' else 'pending' end,
   report=p_report,error=p_error,updated_at=now() where liquidation_id=operation.liquidation_id;
 end if;
 if operation.replenishment_id is not null then
  update sheet_rollovers set status=case when p_status='completed' then 'synced' else 'pending' end,
   target_sheet_id=1042918180,target_name='PCF REPLENISHMENT - BUYING (NOV-DEC 2026)',report=p_report,error=p_error
   where replenishment_id=operation.replenishment_id;
 end if;
end $$;
revoke all on function public.claim_grokbot_dispatch(),public.claim_grokbot_runner(uuid,uuid),public.record_grokbot_result(uuid,uuid,text,jsonb,text),public.queue_grokbot_replenishment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_grokbot_dispatch(),public.claim_grokbot_runner(uuid,uuid),public.record_grokbot_result(uuid,uuid,text,jsonb,text),public.queue_grokbot_replenishment(uuid,uuid,text) to service_role;

-- Preserve old imports and assignments, and point Buying to its approved continuous ledger.
update public.sheet_workbooks set
 spreadsheet_id='1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk',active_sheet_id=1042918180,
 catalog=catalog||jsonb_build_array(jsonb_build_object('sheetId',1042918180,'title','PCF REPLENISHMENT - BUYING (NOV-DEC 2026)',
 'gridProperties',jsonb_build_object('rowCount',1000,'columnCount',22),'expenseTags',jsonb_build_array('CE - FUEL','CE - PARKING AND TOLL'))),
 config_version=config_version+1,last_synced_at=null,refresh_until=null,refresh_token=null
where id='buying';

create or replace function public.enqueue_sheet_rollover() returns trigger language plpgsql security definer set search_path=public as $$
declare book text;
begin
 if new.status='approved' and old.status<>'approved' then
  select id into book from public.sheet_workbooks where custodian_id=new.requested_by and fund_id=new.fund_id and enabled;
  insert into public.sheet_rollovers(replenishment_id,book_id,operation_id)
  values(new.id,book,'replenishment_'||replace(new.id::text,'-','')) on conflict(replenishment_id) do nothing;
 end if;
 return new;
end $$;

-- Prevent assignment changes from redirecting an in-flight operation.
create function public.guard_grokbot_assignment() returns trigger language plpgsql set search_path=public as $$
begin
 if new.id='buying' and new.enabled and (new.spreadsheet_id<>'1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk' or new.active_sheet_id is distinct from 1042918180) then
  raise exception 'Buying uses its configured continuous Grokbot worksheet';
 end if;
 if (new.custodian_id,new.fund_id,new.active_sheet_id,new.enabled) is distinct from (old.custodian_id,old.fund_id,old.active_sheet_id,old.enabled)
 and exists(select 1 from grokbot_operations where status in ('queued','running') and kind in ('liquidation_approved','replenishment_approved')) then
  raise exception 'Complete pending Grokbot deliveries before changing assignments';
 end if;
 return new;
end $$;
create trigger sheet_workbooks_grokbot_guard before update on public.sheet_workbooks for each row execute function public.guard_grokbot_assignment();

create function public.apply_grokbot_snapshot(p_rows jsonb,p_tab jsonb,p_token uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from sheet_workbooks where id='buying' and refresh_token=p_token for update;
 if not found then raise exception 'Refresh lease changed'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 or (p_tab->>'sheetId')::int<>1042918180 then raise exception 'Invalid Buying snapshot'; end if;
 delete from sheet_expenses where book_id='buying' and sheet_id=1042918180;
 insert into sheet_expenses select 'buying',1042918180,r.source_row,'PCF REPLENISHMENT - BUYING (NOV-DEC 2026)',r.expense_date,
 coalesce(r.voucher,''),coalesce(r.category,''),r.particulars,coalesce(r.person,''),coalesce(r.supplier,''),coalesce(r.plate,''),coalesce(r.receipt_number,''),coalesce(r.company,''),r.amount
 from jsonb_to_recordset(p_rows) r(source_row int,expense_date date,voucher text,category text,particulars text,person text,supplier text,plate text,receipt_number text,company text,amount numeric);
 update sheet_workbooks set catalog=coalesce((select jsonb_agg(tab) from jsonb_array_elements(catalog) tab where (tab->>'sheetId')::int<>1042918180),'[]')||jsonb_build_array(p_tab),
 replenishment_sequence=greatest(replenishment_sequence,coalesce((p_tab->>'replenishmentNumber')::int,0)),
 last_synced_at=now(),refresh_until=null,sync_error=null where id='buying';
end $$;
revoke all on function public.apply_grokbot_snapshot(jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.apply_grokbot_snapshot(jsonb,jsonb,uuid) to service_role;

create function public.guard_active_grokbot_deletion() returns trigger language plpgsql set search_path=public as $$
begin
 if old.status in ('queued','running') and old.kind in ('liquidation_approved','replenishment_approved') then
  raise exception 'Complete or reconcile the active Grokbot delivery before deleting its source records';
 end if;
 return old;
end $$;
create trigger grokbot_active_deletion before delete on public.grokbot_operations for each row execute function public.guard_active_grokbot_deletion();
