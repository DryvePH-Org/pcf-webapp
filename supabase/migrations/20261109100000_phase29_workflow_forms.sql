-- Requester expenses and custodian receipt encoding are separate, audited records.
alter table public.vouchers add column flow_version int not null default 1;
alter table public.vouchers add column number_order bigint generated always as identity;
alter table public.liquidations add column flow_version int not null default 2;
alter table public.liquidations add column receipt_review_revision int not null default 0;
alter table public.liquidations add column receipt_reviewed_by uuid references public.profiles(id);
update public.liquidations set flow_version=1 where status='approved';

create table public.liquidation_receipt_lines (
 id uuid primary key default gen_random_uuid(),
 liquidation_id uuid not null references public.liquidations(id) on delete cascade,
 position int not null check(position between 1 and 40),
 particulars text not null check(char_length(btrim(particulars)) between 1 and 300),
 amount numeric(12,2) not null check(amount>0),
 supplier text not null check(char_length(btrim(supplier)) between 1 and 300),
 tin text not null check(char_length(btrim(tin)) between 1 and 100),
 tag text not null check(char_length(btrim(tag)) between 1 and 150),
 expense_date date not null,
 plate text not null default '' check(char_length(plate)<=300),
 receipt_number text not null default '' check(char_length(receipt_number)<=100),
 receipt_path text check(char_length(receipt_path)<=300),
 physical_checked boolean not null check(physical_checked),
 unique(liquidation_id,position)
);
alter table public.liquidation_receipt_lines enable row level security;
revoke all on public.liquidation_receipt_lines from public,anon,authenticated;
grant select on public.liquidation_receipt_lines to authenticated;
grant all on public.liquidation_receipt_lines to service_role;
create policy receipt_lines_read on public.liquidation_receipt_lines for select to authenticated using(public.can_read_liquidation(liquidation_id));
create trigger receipt_lines_audit after insert or update or delete on public.liquidation_receipt_lines for each row execute function public.log_audit();

create function public.pending_expense_category() returns uuid language plpgsql security definer set search_path=public as $$
begin
 insert into public.categories(id,name) values('11111111-1111-4111-8111-111111111111','Pending receipt classification') on conflict(id) do nothing;
 return '11111111-1111-4111-8111-111111111111'::uuid;
end $$;
revoke all on function public.pending_expense_category() from public,anon,authenticated;

create function public.suggest_voucher_number(p_fund uuid) returns text language plpgsql security definer set search_path=public as $$
declare previous text; digits text; next_value numeric;
begin
 perform public.require_role(array['admin','custodian','approver']::public.user_role[]);
 perform public.require_fund_access(p_fund);
 select paper_pcv_number into previous from public.vouchers where fund_id=p_fund and paper_pcv_number is not null order by (flow_version=2) desc,case when flow_version=2 then number_order end desc,created_at desc,number_order desc limit 1;
 if previous is null then
  select e.voucher into previous from public.sheet_workbooks w join public.sheet_expenses e on e.book_id=w.id
  where w.fund_id=p_fund and w.enabled and char_length(e.voucher)<=30 and e.voucher ~ '^[A-Za-z0-9][A-Za-z0-9 ./#-]*$'
  order by (e.sheet_id=w.active_sheet_id) desc,e.expense_date desc nulls last,e.source_row desc,e.sheet_id desc limit 1;
 end if;
 digits:=substring(previous from '[0-9]+$');
 if digits is not null and length(digits)<=30 then
   next_value:=digits::numeric+1;
   return left(previous,length(previous)-length(digits))||lpad(next_value::text,greatest(length(digits),length(next_value::text)),'0');
 end if;
 select coalesce(max(last_no),0)+1 into next_value from public.fund_counters where fund_id=p_fund;
 return lpad(next_value::text,greatest(4,length(next_value::text)),'0');
end $$;

create function public.save_workflow_voucher(p_id uuid,p_fund uuid,p_request uuid,p_payee text,p_date date,p_items jsonb,p_number_mode text,p_number text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; fund uuid; items jsonb; number text; category uuid;
begin
 perform public.require_role(array['admin','custodian','approver']::public.user_role[]);
 fund:=p_fund;
 if p_id is not null then select fund_id into fund from public.vouchers where id=p_id for update; end if;
 perform public.require_fund_access(fund);
 perform 1 from public.funds where id=fund and is_active for update;
 if not found then raise exception 'Active fund not found'; end if;
 if p_number_mode not in ('auto','manual','none') or p_number_mode is null then raise exception 'Choose a voucher numbering option'; end if;
 number:=case p_number_mode when 'auto' then public.suggest_voucher_number(fund) when 'manual' then nullif(btrim(p_number),'') else null end;
 if p_number_mode='manual' and number is null then raise exception 'Enter the voucher number'; end if;
 category:=public.pending_expense_category();
 if jsonb_typeof(p_items)<>'array' then raise exception 'Voucher lines are required'; end if;
 select jsonb_agg(x||jsonb_build_object('category_id',category)) into items from jsonb_array_elements(p_items) x;
 if p_id is not null then
   perform public.update_voucher_lines(p_id,p_payee,items,p_date,number);
   v_id:=p_id;
 elsif p_request is not null then
   v_id:=public.create_voucher_from_request(p_request,items,p_date,null);
   if (select fund_id from public.vouchers where id=v_id)<>fund then raise exception 'Request and fund do not match'; end if;
   number:=public.clean_paper_pcv(number,fund,v_id);
   update public.vouchers set paper_pcv_number=number where id=v_id;
 else
   v_id:=public.create_voucher_lines(fund,p_payee,items,p_date,null,null,number);
 end if;
 update public.vouchers set flow_version=2 where id=v_id;
 return v_id;
end $$;
-- Existing approval limits and release cash checks continue to run. Receipt evidence belongs to liquidation.
do $$ declare name text; definition text; begin
 foreach name in array array['submit_voucher','release_voucher'] loop
  select pg_get_functiondef(p.oid) into definition from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=name;
  if position('if nullif(btrim(coalesce(v_voucher.receipt_path' in definition)=0 then raise exception 'Voucher receipt guard was not found'; end if;
  definition:=replace(definition,'if nullif(btrim(coalesce(v_voucher.receipt_path','if v_voucher.flow_version=1 and nullif(btrim(coalesce(v_voucher.receipt_path');
  execute definition;
 end loop;
end $$;
revoke all on function public.create_voucher_lines(uuid,text,jsonb,date,text,text,text), public.create_voucher_from_request(uuid,jsonb,date,text), public.update_voucher_lines(uuid,text,jsonb,date,text) from public,anon,authenticated;
revoke all on function public.save_workflow_voucher(uuid,uuid,uuid,text,date,jsonb,text,text),public.suggest_voucher_number(uuid) from public,anon;
grant execute on function public.save_workflow_voucher(uuid,uuid,uuid,text,date,jsonb,text,text),public.suggest_voucher_number(uuid) to authenticated;

-- Filing identity and date are established by the server when liquidation is created.
alter function public.create_liquidation(uuid) rename to create_liquidation_legacy;
revoke all on function public.create_liquidation_legacy(uuid) from public,anon,authenticated;
create function public.create_liquidation(p_voucher_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare created_id uuid; begin
 created_id:=public.create_liquidation_legacy(p_voucher_id);
 update public.liquidations l set employee_name=p.full_name from public.profiles p where l.id=created_id and p.id=l.owner_id and l.status='draft';
 return created_id;
end $$;
alter function public.save_liquidation(uuid,text,date,jsonb,text) rename to save_liquidation_legacy;
revoke all on function public.save_liquidation_legacy(uuid,text,date,jsonb,text) from public,anon,authenticated;
create function public.save_liquidation(p_id uuid,p_department text,p_filing_date date,p_items jsonb,p_unspent_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare l public.liquidations; items jsonb; category uuid;
begin
 perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p_id) for update;
 select * into l from public.liquidations where id=p_id for update;
 if not found or not public.can_edit_liquidation(p_id) then raise exception 'Only the requester can edit a draft or flagged liquidation'; end if;
 if p_filing_date is distinct from l.filing_date then raise exception 'The filing date is fixed when liquidation is created'; end if;
 category:=public.pending_expense_category();
 select coalesce(jsonb_agg(x||jsonb_build_object('category_id',category,'no_receipt_reason','','sheet_details',jsonb_build_object('plate',coalesce(x->'sheet_details'->>'plate','')))),'[]') into items from jsonb_array_elements(p_items) x;
 perform public.save_liquidation_legacy(p_id,p_department,l.filing_date,items,p_unspent_reason);
 delete from public.liquidation_receipt_lines where liquidation_id=p_id;
 update public.liquidations set receipt_reviewed_by=null,receipt_review_revision=receipt_review_revision+1 where id=p_id;
end $$;
alter function public.submit_liquidation(uuid) rename to submit_liquidation_legacy;
revoke all on function public.submit_liquidation_legacy(uuid) from public,anon,authenticated;
create function public.submit_liquidation(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p_id) for update;
 perform 1 from public.liquidations where id=p_id for update;
 if exists(select 1 from public.liquidation_items where liquidation_id=p_id and (receipt_path is null or receipt_path !~* '\.(jpg|jpeg|png|webp)$')) then raise exception 'Upload a receipt picture for every expense line'; end if;
 if exists(select 1 from public.liquidation_items i where i.liquidation_id=p_id and not exists(select 1 from storage.objects where bucket_id='liquidation-receipts' and name=i.receipt_path)) then raise exception 'An uploaded receipt is missing'; end if;
 perform public.submit_liquidation_legacy(p_id);
end $$;
revoke all on function public.create_liquidation(uuid),public.save_liquidation(uuid,text,date,jsonb,text),public.submit_liquidation(uuid) from public,anon;
grant execute on function public.create_liquidation(uuid),public.save_liquidation(uuid,text,date,jsonb,text),public.submit_liquidation(uuid) to authenticated;

create function public.save_custodian_receipts(p_id uuid,p_revision int,p_lines jsonb) returns void language plpgsql security definer set search_path=public as $$
declare l public.liquidations; x jsonb; total numeric:=0; n int:=0; amount numeric; path text;
begin
 perform public.require_role(array['admin','custodian']::public.user_role[]);
 perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p_id) for update;
 select * into l from public.liquidations where id=p_id for update;
 if not found or l.status<>'submitted' or l.owner_id=auth.uid() then raise exception 'Another custodian must review a submitted liquidation'; end if;
 perform public.require_fund_access(l.fund_id);
 if l.receipt_review_revision<>p_revision then raise exception 'Receipt review changed. Refresh before saving'; end if;
 if exists(select 1 from public.liquidation_items where liquidation_id=p_id and receipt_path is null) then raise exception 'Flag this liquidation so the requester can attach missing receipts'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>40 then raise exception 'Use at most 40 receipt lines'; end if;
 delete from public.liquidation_receipt_lines where liquidation_id=p_id;
 for x in select * from jsonb_array_elements(p_lines) loop
  n:=n+1; amount:=(x->>'amount')::numeric; path:=x->>'receipt_path';
  if amount is null or amount<=0 or amount<>round(amount,2) then raise exception 'Each receipt amount must be positive with at most two decimals'; end if;
  if path is null or path not like p_id::text||'/%' or path !~* '\.(jpg|jpeg|png|webp)$' or not exists(select 1 from storage.objects where bucket_id='liquidation-receipts' and name=path) then raise exception 'Upload a receipt picture belonging to this liquidation'; end if;
  if (x->>'physical_checked')::boolean is distinct from true then raise exception 'Check the physical receipt for every receipt line'; end if;
  if not ((x->>'tag')=any(public.list_custodian_tags(l.fund_id))) then raise exception 'Choose an existing tag from the assigned workbook. Refresh the workbook to load its tags'; end if;
  insert into public.liquidation_receipt_lines(liquidation_id,position,particulars,amount,supplier,tin,tag,expense_date,plate,receipt_number,receipt_path,physical_checked)
  values(p_id,n,btrim(x->>'particulars'),amount,btrim(x->>'supplier'),btrim(x->>'tin'),x->>'tag',(x->>'expense_date')::date,coalesce(x->>'plate',''),coalesce(x->>'receipt_number',''),path,true);
  total:=total+amount;
 end loop;
 if total<>l.total_spent then raise exception 'Receipt line total must equal the requester total of %',l.total_spent; end if;
 update public.liquidations set receipt_review_revision=receipt_review_revision+1,receipt_reviewed_by=auth.uid() where id=p_id;
end $$;
revoke all on function public.save_custodian_receipts(uuid,int,jsonb) from public,anon;
grant execute on function public.save_custodian_receipts(uuid,int,jsonb) to authenticated;

-- Recheck evidence and review version inside the approval transaction.
alter function public.approve_liquidation_with_sheet(uuid) rename to approve_liquidation_with_sheet_legacy;
revoke all on function public.approve_liquidation_with_sheet_legacy(uuid) from public,anon,authenticated;
create function public.approve_liquidation_with_sheet(p_preview uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare l public.liquidations; p public.sheet_previews; begin
 select * into p from public.sheet_previews where id=p_preview;
 perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p.liquidation_id) for update;
 select * into l from public.liquidations where id=p.liquidation_id for update;
 if l.flow_version=2 then
  if l.receipt_reviewed_by is distinct from auth.uid() or l.receipt_review_revision is distinct from (p.summary->>'review_revision')::int then raise exception 'Complete the custodian receipt review and prepare a fresh preview'; end if;
  if (select coalesce(sum(amount),0) from public.liquidation_receipt_lines where liquidation_id=l.id)<>l.total_spent then raise exception 'Receipt total does not match requester expenses'; end if;
  if exists(select 1 from public.liquidation_items where liquidation_id=l.id and receipt_path is null) then raise exception 'Every requester line needs a receipt image'; end if;
  if exists(select 1 from public.liquidation_receipt_lines r where r.liquidation_id=l.id and not exists(select 1 from storage.objects where bucket_id='liquidation-receipts' and name=r.receipt_path)) then raise exception 'A reviewed receipt image is missing'; end if;
 end if;
 return public.approve_liquidation_with_sheet_legacy(p_preview);
end $$;
revoke all on function public.approve_liquidation_with_sheet(uuid) from public,anon;
grant execute on function public.approve_liquidation_with_sheet(uuid) to authenticated;

-- Assigned custodians may photograph the physical copy into the same private bucket.
create policy liquidation_custodian_receipt_upload on storage.objects for insert to authenticated with check(
 bucket_id='liquidation-receipts' and exists(select 1 from public.liquidations l where l.id::text=split_part(name,'/',1)
 and l.status='submitted' and l.owner_id<>auth.uid() and public.app_role() in ('admin','custodian') and public.can_access_fund(l.fund_id))
);

create function public.list_custodian_tags(p_fund uuid) returns text[] language plpgsql stable security definer set search_path=public as $$
declare tags text[];
begin
 perform public.require_role(array['admin','custodian']::public.user_role[]);
 perform public.require_fund_access(p_fund);
 select coalesce(array_agg(distinct tag_values.tag order by tag_values.tag),'{}') into tags
 from public.sheet_workbooks w cross join lateral jsonb_array_elements(w.catalog) as tabs(tab)
 cross join lateral jsonb_array_elements_text(coalesce(tab->'expenseTags','[]')) as tag_values(tag)
 where w.fund_id=p_fund and w.custodian_id=auth.uid() and w.enabled and (tab->>'sheetId')::int=w.active_sheet_id;
 if cardinality(tags)=0 then
  select coalesce(array_agg(distinct tag order by tag),'{}') into tags from (
   select tag_values.tag from public.sheet_workbooks w cross join lateral jsonb_array_elements(w.catalog) as tabs(tab)
   cross join lateral jsonb_array_elements_text(coalesce(tab->'expenseTags','[]')) as tag_values(tag)
   where w.fund_id=p_fund and w.custodian_id=auth.uid() and w.enabled
   union
   select e.category from public.sheet_workbooks w join public.sheet_expenses e on e.book_id=w.id
   where w.fund_id=p_fund and w.custodian_id=auth.uid() and w.enabled and btrim(e.category)<>''
  ) known_tags;
 end if;
 return tags;
end $$;
revoke all on function public.list_custodian_tags(uuid) from public,anon;
grant execute on function public.list_custodian_tags(uuid) to authenticated;
