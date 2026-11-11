-- Keep the original filing date and accept optional private expense attachments.
update storage.buckets
set file_size_limit=20971520,
    allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf','image/heic','image/heif']
where id='liquidation-receipts';

alter table public.liquidation_receipt_lines
 drop constraint liquidation_receipt_lines_supplier_check,
 drop constraint liquidation_receipt_lines_tin_check,
 add constraint liquidation_receipt_lines_supplier_check
   check(char_length(btrim(supplier)) between (case when receipt_path is null then 0 else 1 end) and 300),
 add constraint liquidation_receipt_lines_tin_check
   check(char_length(btrim(tin)) between (case when receipt_path is null then 0 else 1 end) and 100);

create or replace function public.save_liquidation(p_id uuid,p_department text,p_filing_date date,p_items jsonb,p_unspent_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare l public.liquidations; items jsonb; category uuid;
begin
 perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p_id) for update;
 select * into l from public.liquidations where id=p_id for update;
 if not found or not public.can_edit_liquidation(p_id) then raise exception 'Only the requester can edit a draft or flagged liquidation'; end if;
 if p_filing_date is distinct from l.filing_date then raise exception 'The filing date is fixed when liquidation is created'; end if;
 category:=public.pending_expense_category();
 select coalesce(jsonb_agg(x||jsonb_build_object('category_id',category,'no_receipt_reason',case when nullif(btrim(x->>'receipt_path'),'') is null then coalesce(nullif(btrim(x->>'no_receipt_reason'),''),'No receipt provided') else '' end,'sheet_details',jsonb_build_object('plate',coalesce(x->'sheet_details'->>'plate','')))),'[]') into items from jsonb_array_elements(p_items) x;
 perform public.save_liquidation_legacy(p_id,p_department,l.filing_date,items,p_unspent_reason);
 delete from public.liquidation_receipt_lines where liquidation_id=p_id;
 update public.liquidations set receipt_reviewed_by=null,receipt_review_revision=receipt_review_revision+1 where id=p_id;
end $$;

create or replace function public.submit_liquidation(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p_id) for update;
 perform 1 from public.liquidations where id=p_id for update;
 if exists(select 1 from public.liquidation_items i where i.liquidation_id=p_id and i.receipt_path is not null and not exists(select 1 from storage.objects where bucket_id='liquidation-receipts' and name=i.receipt_path)) then raise exception 'An uploaded receipt is missing'; end if;
 perform public.submit_liquidation_legacy(p_id);
end $$;

create or replace function public.save_custodian_receipts(p_id uuid,p_revision int,p_lines jsonb) returns void language plpgsql security definer set search_path=public as $$
declare l public.liquidations; x jsonb; total numeric:=0; n int:=0; amount numeric; path text;
begin
 perform public.require_role(array['admin','custodian']::public.user_role[]);
 perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p_id) for update;
 select * into l from public.liquidations where id=p_id for update;
 if not found or l.status<>'submitted' or l.owner_id=auth.uid() then raise exception 'Another custodian must review a submitted liquidation'; end if;
 perform public.require_fund_access(l.fund_id);
 if l.receipt_review_revision<>p_revision then raise exception 'Receipt review changed. Refresh before saving'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>40 then raise exception 'Use at most 40 receipt lines'; end if;
 delete from public.liquidation_receipt_lines where liquidation_id=p_id;
 for x in select * from jsonb_array_elements(p_lines) loop
  n:=n+1; amount:=(x->>'amount')::numeric; path:=nullif(btrim(x->>'receipt_path'),'');
  if amount is null or amount<=0 or amount<>round(amount,2) then raise exception 'Each receipt amount must be positive with at most two decimals'; end if;
  if path is not null and (path not like p_id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='liquidation-receipts' and name=path)) then raise exception 'Choose an attachment belonging to this liquidation'; end if;
  if (x->>'physical_checked')::boolean is distinct from true then raise exception 'Confirm the review for every expense line'; end if;
  insert into public.liquidation_receipt_lines(liquidation_id,position,particulars,amount,supplier,tin,tag,expense_date,plate,receipt_number,receipt_path,physical_checked)
  values(p_id,n,btrim(x->>'particulars'),amount,coalesce(btrim(x->>'supplier'),''),coalesce(btrim(x->>'tin'),''),btrim(x->>'tag'),(x->>'expense_date')::date,coalesce(x->>'plate',''),coalesce(x->>'receipt_number',''),path,true);
  total:=total+amount;
 end loop;
 if total<>l.total_spent then raise exception 'Receipt line total must equal the requester total of %',l.total_spent; end if;
 update public.liquidations set receipt_review_revision=receipt_review_revision+1,receipt_reviewed_by=auth.uid() where id=p_id;
end $$;

create or replace function public.approve_liquidation_with_sheet(p_preview uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare l public.liquidations; p public.sheet_previews; begin
 select * into p from public.sheet_previews where id=p_preview;
 perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p.liquidation_id) for update;
 select * into l from public.liquidations where id=p.liquidation_id for update;
 if l.flow_version=2 then
  if l.receipt_reviewed_by is distinct from auth.uid() or l.receipt_review_revision is distinct from (p.summary->>'review_revision')::int then raise exception 'Complete the custodian receipt review and prepare a fresh preview'; end if;
  if (select coalesce(sum(amount),0) from public.liquidation_receipt_lines where liquidation_id=l.id)<>l.total_spent then raise exception 'Receipt total does not match requester expenses'; end if;
  if exists(select 1 from public.liquidation_receipt_lines r where r.liquidation_id=l.id and r.receipt_path is not null and not exists(select 1 from storage.objects where bucket_id='liquidation-receipts' and name=r.receipt_path)) then raise exception 'A reviewed receipt image is missing'; end if;
 end if;
 return public.approve_liquidation_with_sheet_legacy(p_preview);
end $$;

create or replace function public.list_custodian_tags(p_fund uuid) returns text[]
language plpgsql stable security definer set search_path=public as $$
declare workbook public.sheet_workbooks;
begin
 perform public.require_role(array['admin','custodian']::public.user_role[]);
 perform public.require_fund_access(p_fund);
 select * into workbook from public.sheet_workbooks
 where fund_id=p_fund and custodian_id=auth.uid()
 order by enabled desc, id limit 1;
 return array(
  select distinct btrim(tag) from (
   select value as tag from jsonb_array_elements(workbook.catalog) tabs(tab)
   cross join lateral jsonb_array_elements_text(coalesce(tab->'expenseTags','[]'))
   where (tab->>'sheetId')::int=workbook.active_sheet_id
   union all
   select category from public.sheet_expenses where book_id=workbook.id
   union all
   select r.tag from public.liquidation_receipt_lines r
   join public.sheet_jobs j on j.liquidation_id=r.liquidation_id
   where j.book_id=workbook.id and j.status='synced'
  ) known where btrim(tag)<>'' order by btrim(tag)
 );
end $$;

create function public.lock_liquidation_filing_date() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.filing_date is distinct from old.filing_date then
  raise exception 'The filing date is fixed when liquidation is created';
 end if;
 return new;
end $$;

create trigger liquidation_filing_date_immutable
before update of filing_date on public.liquidations
for each row execute function public.lock_liquidation_filing_date();
