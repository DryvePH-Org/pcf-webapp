-- Google mirror is separate from the financial ledger. No imported row moves cash.
create table public.sheet_workbooks (
 id text primary key check(id in ('operations','buying','selling','lmr','dryve')),
 audit_id uuid not null unique default gen_random_uuid(),
 name text not null, spreadsheet_id text not null unique,
 custodian_id uuid references public.profiles(id), fund_id uuid references public.funds(id),
 active_sheet_id int, config_version int not null default 1,
 catalog jsonb not null default '[]', last_synced_at timestamptz,
 refresh_until timestamptz, refresh_token uuid, sync_error text, enabled boolean not null default false
);
create unique index sheet_destination_unique on public.sheet_workbooks(custodian_id,fund_id) where enabled;
create table public.sheet_expenses (
 book_id text not null references public.sheet_workbooks(id), sheet_id int not null,
 source_row int not null, sheet_name text not null, expense_date date,
 voucher text not null default '', category text not null default '', particulars text not null,
 person text not null default '', supplier text not null default '', plate text not null default '',
 receipt_number text not null default '', company text not null default '', amount numeric(12,2) not null,
 primary key(book_id,sheet_id,source_row)
);
create index sheet_expenses_date_idx on public.sheet_expenses(expense_date desc);
alter table public.sheet_workbooks enable row level security;
alter table public.sheet_expenses enable row level security;
revoke all on public.sheet_workbooks,public.sheet_expenses from anon,authenticated;
grant select on public.sheet_workbooks,public.sheet_expenses to authenticated;
grant all on public.sheet_workbooks,public.sheet_expenses to service_role;
create policy sheets_config_read on public.sheet_workbooks for select to authenticated using(public.app_role() in ('admin','accounting') or custodian_id=auth.uid());
create policy sheets_expenses_read on public.sheet_expenses for select to authenticated using(public.app_role() in ('admin','accounting'));
create function public.audit_sheet_workbook() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.audit_log(entity_type,entity_id,action,actor_id,old_data,new_data) values('sheet_workbooks',case when tg_op='DELETE' then old.audit_id else new.audit_id end,lower(tg_op),auth.uid(),case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end);
 return coalesce(new,old);
end $$;
create trigger sheet_workbooks_audit after insert or update or delete on public.sheet_workbooks for each row execute function public.audit_sheet_workbook();
insert into public.sheet_workbooks(id,name,spreadsheet_id) values
 ('operations','MAD Operations','1XfAjl-cONxOdPganObQzxwXy12T5TkJItERY-SoghfM'),
 ('buying','MAD Buying','1XuReREuOKezAZWmwhuWc60BgTuZwX-vuRC5OMjp-g18'),
 ('selling','MAD Selling','1aafL4rtQHXqr5zUut7NZ4H0cR6FKqFzswgXDvUdQBB8'),
 ('lmr','MAD LMR','1h2LDeemJZBSBUtyrUs3-rvEVsi26eyJoMeex1a29Los'),
 ('dryve','Dryve','1yhst5xpEQ41cAEc89-GVd-QXpUlshpckfzAk2vbxR9w');
create function public.configure_sheet_workbook(p_id text,p_custodian uuid,p_fund uuid,p_sheet int,p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform public.require_role(array['admin']::public.user_role[]);
 if p_custodian is not null and not exists(select 1 from public.profiles where id=p_custodian and role='custodian' and is_active) then raise exception 'Select an active custodian'; end if;
 if p_fund is not null and not exists(select 1 from public.fund_custodians where fund_id=p_fund and custodian_id=p_custodian) then raise exception 'Assign this custodian to the fund first'; end if;
 if p_enabled and (p_custodian is null or p_fund is null or p_sheet is null) then raise exception 'Select custodian, fund, and active worksheet'; end if;
 if p_sheet is not null and not exists(select 1 from public.sheet_workbooks w,jsonb_array_elements(w.catalog) t where w.id=p_id and (t->>'sheetId')::int=p_sheet) then raise exception 'Refresh and select a current worksheet'; end if;
 update public.sheet_workbooks set custodian_id=p_custodian,fund_id=p_fund,active_sheet_id=p_sheet,enabled=p_enabled,config_version=config_version+1 where id=p_id;
 if not found then raise exception 'Workbook not found'; end if;
end $$;
revoke all on function public.configure_sheet_workbook(text,uuid,uuid,int,boolean) from public,anon;
grant execute on function public.configure_sheet_workbook(text,uuid,uuid,int,boolean) to authenticated;
create function public.claim_sheet_refresh(p_id text) returns uuid language plpgsql security definer set search_path=public as $$
declare token uuid:=gen_random_uuid();
begin
 update public.sheet_workbooks set refresh_token=token,refresh_until=now()+interval '5 minutes' where id=p_id and (refresh_until is null or refresh_until<now()) and (last_synced_at is null or last_synced_at<now()-interval '60 seconds');
 if found then return token; end if; return null;
end $$;
create function public.replace_sheet_mirror(p_id text,p_rows jsonb,p_catalog jsonb,p_token uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.sheet_workbooks where id=p_id and refresh_token=p_token for update;
 if not found then raise exception 'Refresh lease superseded'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>30000 then raise exception 'Invalid snapshot'; end if;
 delete from public.sheet_expenses where book_id=p_id;
 insert into public.sheet_expenses select p_id,r.sheet_id,r.source_row,r.sheet_name,r.expense_date,coalesce(r.voucher,''),coalesce(r.category,''),r.particulars,coalesce(r.person,''),coalesce(r.supplier,''),coalesce(r.plate,''),coalesce(r.receipt_number,''),coalesce(r.company,''),r.amount
 from jsonb_to_recordset(p_rows) r(sheet_id int,source_row int,sheet_name text,expense_date date,voucher text,category text,particulars text,person text,supplier text,plate text,receipt_number text,company text,amount numeric);
 update public.sheet_workbooks set catalog=p_catalog,last_synced_at=now(),refresh_until=null,sync_error=null where id=p_id;
end $$;
revoke all on function public.claim_sheet_refresh(text),public.replace_sheet_mirror(text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.claim_sheet_refresh(text),public.replace_sheet_mirror(text,jsonb,jsonb,uuid) to service_role;

alter table public.liquidation_items add column sheet_details jsonb not null default '{}';
alter function public.save_liquidation(uuid,text,date,jsonb,text) rename to save_liquidation_before_sheets;
revoke all on function public.save_liquidation_before_sheets(uuid,text,date,jsonb,text) from public,anon,authenticated;
create function public.save_liquidation(p_id uuid,p_department text,p_filing_date date,p_items jsonb,p_unspent_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare x jsonb; details jsonb;
begin
 perform public.save_liquidation_before_sheets(p_id,p_department,p_filing_date,p_items,p_unspent_reason);
 for x in select * from jsonb_array_elements(p_items) loop
  details:=coalesce(x->'sheet_details','{}');
  if jsonb_typeof(details)<>'object' or octet_length(details::text)>4000 then raise exception 'Invalid expense details'; end if;
  if nullif(details->>'expense_date','') is not null then perform (details->>'expense_date')::date; end if;
  update public.liquidation_items set sheet_details=details where id=(x->>'id')::uuid and liquidation_id=p_id;
 end loop;
end $$;
revoke all on function public.save_liquidation(uuid,text,date,jsonb,text) from public,anon;
grant execute on function public.save_liquidation(uuid,text,date,jsonb,text) to authenticated;
create table public.sheet_previews (
 id uuid primary key default gen_random_uuid(), liquidation_id uuid not null references public.liquidations(id),
 reviewer_id uuid not null references public.profiles(id), revision int not null,
 book_id text not null references public.sheet_workbooks(id), config_version int not null,
 sheet_id int not null, sheet_name text not null, operation_id text not null,
 requests jsonb not null, google_token text not null, summary jsonb not null,
 expires_at timestamptz not null default now()+interval '4 minutes',created_at timestamptz not null default now()
);
create table public.sheet_jobs (
 id uuid primary key default gen_random_uuid(),liquidation_id uuid not null unique references public.liquidations(id),
 preview_id uuid not null references public.sheet_previews(id),book_id text not null references public.sheet_workbooks(id),
 operation_id text not null unique,status text not null default 'pending' check(status in ('pending','synced','conflict')),
 report jsonb,error text,attempts int not null default 0,updated_at timestamptz not null default now()
);
alter table public.sheet_previews enable row level security;
alter table public.sheet_jobs enable row level security;
revoke all on public.sheet_previews,public.sheet_jobs from anon,authenticated;
grant all on public.sheet_previews,public.sheet_jobs to service_role;
grant select on public.sheet_jobs to authenticated;
create policy sheet_jobs_read on public.sheet_jobs for select to authenticated using(public.can_read_liquidation(liquidation_id));
-- Existing approval endpoint becomes flag-only; approval requires a bound preview.
alter function public.review_liquidation(uuid,boolean,text) rename to review_liquidation_before_sheets;
revoke all on function public.review_liquidation_before_sheets(uuid,boolean,text) from public,anon,authenticated;
create function public.review_liquidation(p_id uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_approve then raise exception 'Review the Google Sheets update preview before approval'; end if;
 perform public.review_liquidation_before_sheets(p_id,p_approve,p_note);
end $$;
create function public.approve_liquidation_with_sheet(p_preview uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare p public.sheet_previews%rowtype; l public.liquidations%rowtype; w public.sheet_workbooks%rowtype; job uuid;
begin
 select * into p from public.sheet_previews where id=p_preview for update;
 if not found or p.reviewer_id<>auth.uid() or p.expires_at<now() then raise exception 'Preview expired. Review the update again'; end if;
 select * into w from public.sheet_workbooks where id=p.book_id for share;
 if not w.enabled or w.config_version<>p.config_version or w.custodian_id is distinct from auth.uid() or w.active_sheet_id<>p.sheet_id then raise exception 'Workbook assignment changed. Review again'; end if;
 perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p.liquidation_id) for update;
 select * into l from public.liquidations where id=p.liquidation_id for update;
 if l.revision<>p.revision or l.fund_id<>w.fund_id then raise exception 'Liquidation or fund changed. Review again'; end if;
 perform public.review_liquidation_before_sheets(p.liquidation_id,true,null);
 insert into public.sheet_jobs(liquidation_id,preview_id,book_id,operation_id) values(l.id,p.id,p.book_id,p.operation_id) returning id into job;
 return job;
end $$;
revoke all on function public.review_liquidation(uuid,boolean,text),public.approve_liquidation_with_sheet(uuid) from public,anon;
grant execute on function public.review_liquidation(uuid,boolean,text),public.approve_liquidation_with_sheet(uuid) to authenticated;
create table public.sheet_rollovers (
 id uuid primary key default gen_random_uuid(),replenishment_id uuid not null unique references public.replenishments(id),
 book_id text references public.sheet_workbooks(id),operation_id text not null unique,
 status text not null default 'pending' check(status in ('pending','synced')),
 target_sheet_id int,target_name text,requests jsonb,report jsonb,error text,created_at timestamptz not null default now()
);
alter table public.sheet_rollovers enable row level security;
revoke all on public.sheet_rollovers from anon,authenticated;
grant select on public.sheet_rollovers to authenticated;
grant all on public.sheet_rollovers to service_role;
create policy sheet_rollovers_read on public.sheet_rollovers for select to authenticated using(public.app_role() in ('admin','accounting') or exists(select 1 from public.replenishments r where r.id=replenishment_id and public.can_access_fund(r.fund_id)));
create function public.enqueue_sheet_rollover() returns trigger language plpgsql security definer set search_path=public as $$
declare book text;
begin
 if new.status='closed' and old.status<>'closed' then
  select id into book from public.sheet_workbooks where custodian_id=new.requested_by and fund_id=new.fund_id and enabled;
  insert into public.sheet_rollovers(replenishment_id,book_id,operation_id) values(new.id,book,'replenishment_'||replace(new.id::text,'-',''));
 end if;
 return new;
end $$;
create trigger replenishment_sheet_rollover after update on public.replenishments for each row execute function public.enqueue_sheet_rollover();
