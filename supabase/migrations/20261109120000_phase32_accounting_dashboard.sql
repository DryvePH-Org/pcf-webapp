alter table public.sheet_expenses add column tin text not null default '';
alter table public.sheet_expenses add column address text not null default '';

create or replace function public.replace_sheet_mirror(p_id text,p_rows jsonb,p_catalog jsonb,p_token uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.sheet_workbooks where id=p_id and refresh_token=p_token for update;
 if not found then raise exception 'Refresh lease superseded'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>30000 then raise exception 'Invalid snapshot'; end if;
 delete from public.sheet_expenses where book_id=p_id;
 insert into public.sheet_expenses(book_id,sheet_id,source_row,sheet_name,expense_date,voucher,category,particulars,person,supplier,plate,receipt_number,company,amount,tin,address)
 select p_id,r.sheet_id,r.source_row,r.sheet_name,r.expense_date,coalesce(r.voucher,''),coalesce(r.category,''),r.particulars,coalesce(r.person,''),coalesce(r.supplier,''),coalesce(r.plate,''),coalesce(r.receipt_number,''),coalesce(r.company,''),r.amount,coalesce(r.tin,''),coalesce(r.address,'')
 from jsonb_to_recordset(p_rows) r(sheet_id int,source_row int,sheet_name text,expense_date date,voucher text,category text,particulars text,person text,supplier text,plate text,receipt_number text,company text,amount numeric,tin text,address text);
 update public.sheet_workbooks set catalog=p_catalog,last_synced_at=now(),refresh_until=null,sync_error=null where id=p_id;
end $$;

-- Accounting controls the same audited assignment operation, without access to other Admin settings.
do $$ declare definition text; begin
 select pg_get_functiondef('public.configure_sheet_workbook(text,uuid,uuid,int,boolean)'::regprocedure) into definition;
 definition:=replace(definition,'array[''admin'']','array[''admin'',''accounting'']');
 execute definition;
end $$;

-- Keep every source row. Cross-sheet copies are ranked for consolidated reporting only.
create view public.sheet_expense_reporting_v with(security_invoker=true) as
with keyed as (
 select e.*,w.custodian_id,p.full_name as custodian_name,w.name as workbook_name,w.spreadsheet_id,
 coalesce((select max(ordinality) from jsonb_array_elements(w.catalog) with ordinality tab(value,ordinality) where (value->>'sheetId')::int=e.sheet_id),0) as tab_order,
 (e.sheet_id=w.active_sheet_id) is true as active_tab,
 case when e.expense_date is not null and (btrim(e.voucher)<>'' or btrim(e.receipt_number)<>'') then
 md5(jsonb_build_array(e.expense_date,e.voucher,e.receipt_number,e.category,e.particulars,e.person,e.supplier,e.plate,e.company,e.amount,e.tin,e.address)::text)
 else e.sheet_id::text||':'||e.source_row::text end as match_key
 from public.sheet_expenses e join public.sheet_workbooks w on w.id=e.book_id left join public.profiles p on p.id=w.custodian_id
), occurrences as (
 select keyed.*,row_number() over(partition by book_id,sheet_id,match_key order by source_row) as occurrence from keyed
)
select occurrences.*,row_number() over(partition by book_id,match_key,occurrence order by active_tab desc,tab_order desc,sheet_id desc,source_row desc) as copy_rank
from occurrences;
grant select on public.sheet_expense_reporting_v to authenticated,service_role;
revoke all on public.sheet_expense_reporting_v from anon;

create function public.accounting_dashboard(p_filters jsonb,p_export boolean default false) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb; total_rows bigint;
 book text:=nullif(p_filters->>'book',''); custodian text:=nullif(p_filters->>'custodian','');
 date_from date:=nullif(p_filters->>'from','')::date; date_to date:=nullif(p_filters->>'to','')::date;
 tab int:=nullif(p_filters->>'tab','')::int; page int:=greatest(1,least(10000,coalesce((p_filters->>'page')::int,1)));
 repeats boolean:=coalesce((p_filters->>'repeats')::boolean,false); missing_dates boolean:=coalesce(p_filters->>'date_status','')='missing';
begin
 perform public.require_role(array['admin','accounting']::public.user_role[]);
 if date_from>date_to then raise exception 'The start date must be before the end date'; end if;
 if book is not null and not exists(select 1 from public.sheet_workbooks where id=book) then raise exception 'Workbook not found'; end if;
 if tab is not null and book is null then raise exception 'Choose a workbook before selecting a worksheet'; end if;
 with scope as (
  select r.* from public.sheet_expense_reporting_v r
  where (book is null or r.book_id=book)
  and (custodian is null or (custodian='unassigned' and r.custodian_id is null) or r.custodian_id::text=custodian)
  and (tab is null or r.sheet_id=tab)
  and (nullif(p_filters->>'q','') is null or position(lower(p_filters->>'q') in lower(concat_ws(' ',r.workbook_name,r.sheet_name,r.voucher,r.particulars,r.person,r.supplier,r.plate,r.receipt_number,r.category,r.company,r.tin,r.address)))>0)
  and (nullif(p_filters->>'person','') is null or position(lower(p_filters->>'person') in lower(r.person))>0)
  and (nullif(p_filters->>'supplier','') is null or position(lower(p_filters->>'supplier') in lower(r.supplier))>0)
  and (nullif(p_filters->>'plate','') is null or position(lower(p_filters->>'plate') in lower(r.plate))>0)
  and (nullif(p_filters->>'tin','') is null or position(lower(p_filters->>'tin') in lower(r.tin))>0)
  and (nullif(p_filters->>'category','') is null or r.category=p_filters->>'category')
  and (nullif(p_filters->>'company','') is null or r.company=p_filters->>'company')
  and (coalesce(p_filters->>'classification','')='' or (p_filters->>'classification'='CE' and upper(r.category)~'^CE([ -]|$)') or (p_filters->>'classification'='NCE' and upper(r.category)~'^NCE([ -]|$)') or (p_filters->>'classification'='other' and upper(r.category)!~'^(NCE|CE)([ -]|$)'))
  and (coalesce(p_filters->>'receipt','')='' or (p_filters->>'receipt'='missing' and btrim(r.receipt_number)='') or (p_filters->>'receipt'='present' and btrim(r.receipt_number)<>''))
 ), dated as (
  select * from scope where (not missing_dates or expense_date is null)
   and (date_from is null or expense_date>=date_from) and (date_to is null or expense_date<=date_to)
 ), filtered as (
  select * from dated where repeats or tab is not null or copy_rank=1
 ), page_rows as (
  select * from filtered order by expense_date desc nulls last,book_id,sheet_id,source_row
  limit case when p_export then 25001 else 50 end offset case when p_export then 0 else (page-1)*50 end
 ), totals as (
  select count(*) as expense_count,coalesce(sum(amount),0) as amount,
  count(distinct case when btrim(voucher)<>'' then book_id||':'||voucher end) as vouchers,
  count(distinct nullif(lower(supplier),'')) as suppliers,
  count(*) filter(where btrim(receipt_number)='') as missing_receipt_numbers,
  coalesce(sum(amount) filter(where upper(category)~'^CE([ -]|$)'),0) as ce_amount,
  coalesce(sum(amount) filter(where upper(category)~'^NCE([ -]|$)'),0) as nce_amount,
  count(*) filter(where btrim(category)='') as missing_tags from filtered
 ), workbook_totals as (
  select book_id,count(*) as count,sum(amount) as amount from filtered group by book_id
 ), tag_totals as (
  select coalesce(nullif(category,''),'Unclassified') as label,sum(amount) as amount,count(*) as count from filtered group by category order by sum(amount) desc limit 8
 ), month_totals as (
  select to_char(expense_date,'YYYY-MM') as month,sum(amount) as amount,count(*) as count from filtered where expense_date is not null group by to_char(expense_date,'YYYY-MM') order by month desc limit 12
 )
 select jsonb_build_object(
  'totals',(select to_jsonb(totals) from totals),
  'rows',coalesce((select jsonb_agg(to_jsonb(page_rows) order by expense_date desc nulls last,book_id,sheet_id,source_row) from page_rows),'[]'),
  'by_workbook',coalesce((select jsonb_agg(to_jsonb(workbook_totals) order by amount desc) from workbook_totals),'[]'),
  'by_category',coalesce((select jsonb_agg(to_jsonb(tag_totals) order by amount desc) from tag_totals),'[]'),
  'by_month',coalesce((select jsonb_agg(to_jsonb(month_totals) order by month) from month_totals),'[]'),
  'hidden_copies',case when repeats or tab is not null then 0 else (select count(*) from dated where copy_rank>1) end,
  'undated_scope',(select count(*) from scope where expense_date is null and (repeats or tab is not null or copy_rank=1)),
  'latest_date',(select max(expense_date) from public.sheet_expenses where expense_date<=(now() at time zone 'Asia/Manila')::date),
  'categories',coalesce((select jsonb_agg(category order by category) from (select distinct e.category from public.sheet_expenses e where btrim(e.category)<>'' and (book is null or e.book_id=book)) categories),'[]'),
  'companies',coalesce((select jsonb_agg(company order by company) from (select distinct e.company from public.sheet_expenses e where btrim(e.company)<>'' and (book is null or e.book_id=book)) companies),'[]')
 ) into result;
 total_rows:=(result->'totals'->>'expense_count')::bigint;
 if p_export and total_rows>25000 then raise exception 'This export exceeds 25,000 rows. Narrow the filters and export again'; end if;
 return result;
end $$;
revoke all on function public.accounting_dashboard(jsonb,boolean) from public,anon;
grant execute on function public.accounting_dashboard(jsonb,boolean) to authenticated;
