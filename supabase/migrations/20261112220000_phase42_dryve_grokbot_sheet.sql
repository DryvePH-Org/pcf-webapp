-- Phase 42: a second Grokbot sheet (DRYVE PCF). One bot per spreadsheet.
-- The Buying-only checks of phases 36 and 37 become a short allowlist of
-- destinations, and the Company chosen per expense line is stored.
-- Buying behaves exactly as before.

-- ------------------------------------------------------ allowed destinations
-- Keep in step with src/lib/grokbot/targets.ts. A new sheet is added in both places, on purpose.
create function public.grokbot_targets() returns table(book text, spreadsheet_id text, sheet_id int, sheet_title text)
language sql immutable as $$
  select * from (values
    ('buying'::text, '1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk'::text, 1042918180::int, 'PCF REPLENISHMENT - BUYING (NOV-DEC 2026)'::text),
    ('dryve'::text,  '1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ'::text, 1251133408::int, 'DRYVE PCF - NOV TO DEC 2026'::text)
  ) t(book, spreadsheet_id, sheet_id, sheet_title);
$$;
create function public.grokbot_destination_ok(p_spreadsheet text, p_sheet int) returns boolean
language sql immutable as $$
  select exists (select 1 from public.grokbot_targets() t where t.spreadsheet_id = p_spreadsheet and t.sheet_id = p_sheet);
$$;
revoke execute on function public.grokbot_targets(), public.grokbot_destination_ok(text, int) from public, anon;
grant execute on function public.grokbot_targets(), public.grokbot_destination_ok(text, int) to authenticated, service_role;

alter table public.grokbot_operations
  drop constraint grokbot_operations_spreadsheet_id_check,
  drop constraint grokbot_operations_sheet_id_check,
  add constraint grokbot_operations_destination_check check (public.grokbot_destination_ok(spreadsheet_id, sheet_id));

-- ------------------------------------------------------------ company per line
alter table public.liquidation_receipt_lines
  add column company text not null default '' check (char_length(company) <= 50 and company !~ '[\x01-\x1f\x7f<>]');

do $$
declare def text; fixed text;
begin
  select pg_get_functiondef('public.save_custodian_receipts(uuid,integer,jsonb)'::regprocedure) into def;
  fixed := replace(def, 'receipt_number,receipt_path,physical_checked)', 'receipt_number,company,receipt_path,physical_checked)');
  if fixed = def then raise exception 'Receipt line columns were not found'; end if;
  def := fixed;
  fixed := replace(def, 'coalesce(x->>''receipt_number'',''''),path,true)', 'coalesce(x->>''receipt_number'',''''),coalesce(btrim(x->>''company''),''''),path,true)');
  if fixed = def then raise exception 'Receipt line values were not found'; end if;
  execute fixed;
end $$;

-- --------------------------------------------------- replenishment marker row
drop function public.queue_grokbot_replenishment(uuid, uuid, text);
create function public.queue_grokbot_replenishment(p_id uuid, p_operation uuid, p_hash text, p_book text default 'buying') returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.replenishments; existing uuid; previous_number int; custodian text; t record;
begin
 select * into t from public.grokbot_targets() where book = p_book;
 if not found then raise exception 'Grokbot is not configured for this workbook'; end if;
 perform pg_advisory_xact_lock(hashtextextended('grokbot-' || p_book || '-replenishment', 0));
 select id into existing from grokbot_operations where replenishment_id=p_id;
 if existing is not null then return existing; end if;
 select * into r from replenishments where id=p_id for share;
 if not found or r.status not in ('approved','closed') or r.reviewed_by is null or r.reviewed_at is null or r.approver_id is null or r.approver_approved_at is null or r.reviewed_by=r.approver_id then
  raise exception 'Accounting and an independent Approver must approve first';
 end if;
 perform 1 from sheet_workbooks where id=p_book and enabled and fund_id=r.fund_id and custodian_id=r.requested_by
  and spreadsheet_id=t.spreadsheet_id and active_sheet_id=t.sheet_id for share;
 if not found then raise exception 'Assign this custodian and fund to the % workbook first', initcap(p_book); end if;
 select full_name into custodian from profiles where id=r.requested_by;
 select replenishment_sequence into previous_number from sheet_workbooks where id=p_book for update;
 update sheet_workbooks set replenishment_sequence=previous_number+1 where id=p_book;
 insert into grokbot_operations(id,kind,spreadsheet_id,sheet_id,callback_hash,replenishment_id,expires_at,payload)
 values(p_operation,'replenishment_approved',t.spreadsheet_id,t.sheet_id,p_hash,p_id,now()+interval '2 hours',
  jsonb_build_object('protocol_version','pcf.grokbot.v1','operation_id',p_operation,'event','pcf.replenishment.approved',
   'target',jsonb_build_object('spreadsheet_id',t.spreadsheet_id,'sheet_id',t.sheet_id,'sheet_title',t.sheet_title),
   'replenishment_id',p_id,'replenishment_number',previous_number+1,'expected_previous_replenishment_number',previous_number,
   'approved_amount',r.total::text,'accounting_approved_at',to_char(r.reviewed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'approver_approved_at',to_char(r.approver_approved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'accounting_id',r.reviewed_by,'approver_id',r.approver_id,'custodian_name',custodian,
   'approval_date',(r.approver_approved_at at time zone 'Asia/Manila')::date::text));
 return p_operation;
end $$;
revoke all on function public.queue_grokbot_replenishment(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.queue_grokbot_replenishment(uuid, uuid, text, text) to service_role;

-- ------------------------------------------------ dispatch: one run per sheet
-- A sheet takes one operation at a time; different sheets (different bots) run side by side.
create or replace function public.claim_grokbot_dispatch() returns setof public.grokbot_operations
language plpgsql security definer set search_path=public as $$
declare operation uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('grokbot-buying-dispatch',0));
 select q.id into operation from grokbot_operations q
  where q.status='queued'
    and not exists (select 1 from grokbot_operations r
                    where r.status='running' and r.spreadsheet_id=q.spreadsheet_id and r.sheet_id=q.sheet_id)
  order by q.created_at, q.id limit 1 for update;
 if operation is null then return; end if;
 return query update grokbot_operations set status='running',updated_at=now() where id=operation returning *;
end $$;

-- ---------------------------------------------------------- recorded results
do $$
declare def text; fixed text;
begin
  select pg_get_functiondef('public.record_grokbot_result(uuid,uuid,text,jsonb,text)'::regprocedure) into def;
  fixed := replace(def,
    'target_sheet_id=1042918180,target_name=''PCF REPLENISHMENT - BUYING (NOV-DEC 2026)''',
    'target_sheet_id=operation.sheet_id,target_name=coalesce((select t.sheet_title from public.grokbot_targets() t where t.spreadsheet_id=operation.spreadsheet_id and t.sheet_id=operation.sheet_id),'''')');
  if fixed = def then raise exception 'Rollover target was not found'; end if;
  execute fixed;
end $$;

-- ------------------------------------------------------ assignment guard
create or replace function public.guard_grokbot_assignment() returns trigger language plpgsql set search_path=public as $$
declare t record;
begin
 select * into t from public.grokbot_targets() where book = new.id;
 if found and new.enabled and (new.spreadsheet_id<>t.spreadsheet_id or new.active_sheet_id is distinct from t.sheet_id) then
  raise exception '% uses its configured continuous Grokbot worksheet', initcap(new.id);
 end if;
 if (new.custodian_id,new.fund_id,new.active_sheet_id,new.enabled) is distinct from (old.custodian_id,old.fund_id,old.active_sheet_id,old.enabled)
 and exists(select 1 from grokbot_operations where status in ('queued','running') and kind in ('liquidation_approved','replenishment_approved')
            and spreadsheet_id=old.spreadsheet_id) then
  raise exception 'Complete pending Grokbot deliveries before changing assignments';
 end if;
 return new;
end $$;

-- --------------------------------------------------------- saved snapshots
create function public.apply_grokbot_book_snapshot(p_book text, p_rows jsonb, p_tab jsonb, p_token uuid) returns void
language plpgsql security definer set search_path=public as $$
declare t record;
begin
 select * into t from public.grokbot_targets() where book = p_book;
 if not found then raise exception 'Grokbot is not configured for this workbook'; end if;
 perform 1 from sheet_workbooks where id=p_book and refresh_token=p_token for update;
 if not found then raise exception 'Refresh lease changed'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 or (p_tab->>'sheetId')::int<>t.sheet_id then raise exception 'Invalid snapshot'; end if;
 delete from sheet_expenses where book_id=p_book and sheet_id=t.sheet_id;
 insert into sheet_expenses select p_book,t.sheet_id,r.source_row,t.sheet_title,r.expense_date,
 coalesce(r.voucher,''),coalesce(r.category,''),r.particulars,coalesce(r.person,''),coalesce(r.supplier,''),coalesce(r.plate,''),coalesce(r.receipt_number,''),coalesce(r.company,''),r.amount
 from jsonb_to_recordset(p_rows) r(source_row int,expense_date date,voucher text,category text,particulars text,person text,supplier text,plate text,receipt_number text,company text,amount numeric);
 update sheet_workbooks set catalog=coalesce((select jsonb_agg(tab) from jsonb_array_elements(catalog) tab where (tab->>'sheetId')::int<>t.sheet_id),'[]')||jsonb_build_array(p_tab),
 replenishment_sequence=greatest(replenishment_sequence,coalesce((p_tab->>'replenishmentNumber')::int,0)),
 last_synced_at=now(),refresh_until=null,sync_error=null where id=p_book;
end $$;
revoke all on function public.apply_grokbot_book_snapshot(text, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.apply_grokbot_book_snapshot(text, jsonb, jsonb, uuid) to service_role;

-- ------------------------------------------------------ the DRYVE workbook
-- Point the existing "dryve" workbook at the new spreadsheet. It stays disabled
-- until an administrator assigns its custodian and fund. Its last replenishment
-- marker on the sheet is #13, so the next one is #14.
update public.sheet_workbooks set
 spreadsheet_id='1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ',
 active_sheet_id=1251133408,
 enabled=false, custodian_id=null, fund_id=null,
 catalog=jsonb_build_array(jsonb_build_object('sheetId',1251133408,'title','DRYVE PCF - NOV TO DEC 2026',
  'gridProperties',jsonb_build_object('rowCount',112,'columnCount',17),
  'expenseTags',jsonb_build_array('ADMIN AND OFFICE SUPPLIES','ALLOWANCE','BANK FEE/GCASH CHARGES','CASH ADVANCE','COMMISSION','COMMUNICATION',
   'DELIVERY/COURIER','DETAILING EXPENSE','FACILITATION (SOP)','FUEL AND OIL','GADGET','HOTEL & ACCOMODATION','HUMAN RESOURCE EXPENSE',
   'LICENSES AND PERMIT','MARKETING','MEALS','MEDICAL EXPENSES','NOTARIAL','OFFICE EQUIPMENT','OTHER EXPENSES','OTHER SALARIES/BONUSES',
   'PARKING AND TOLL','PARTS EXPENSE','REPAIRS AND MAINTENANCE','REPRESENTATION','SUBSCRIPTION EXPENSE','SUPPLIES: CLEANING',
   'SUPPLIES: DRINKING WATER','TRANSFER','TRANSPORTATION'))),
 replenishment_sequence=13,
 config_version=config_version+1,last_synced_at=null,refresh_until=null,refresh_token=null
where id='dryve';
