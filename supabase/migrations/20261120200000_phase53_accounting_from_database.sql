-- Phase 53: the Accounting dashboard can read the app's own records, not only the Google Sheet copy.
--
-- Until now every figure on the Accounting page came from sheet_expenses, the copy of the sheet that Grokbot's
-- refresh brings back. That copy is behind (it waits for a refresh), cannot see a fund that has no sheet, and can be
-- wrong when someone edits the sheet by hand. The dashboard now reads the approved liquidations in the database:
--   * an expense shows the moment its liquidation is approved, with no refresh,
--   * a database-only fund appears (it has no sheet at all),
--   * each row links back to its liquidation.
-- The Google Sheet copy stays one click away ("Records from"), so the two can be compared.
-- For a fund that has a sheet the workbook id is kept ('buying', 'dryve'), so every existing filter still works;
-- a database-only fund is identified as 'fund:<id>'.

create view public.accounting_expenses_v as
with approved as (
  select l.id as liquidation_id, l.fund_id, l.employee_name, l.reviewed_by, l.reviewed_at,
         case when v.flow_version = 2 then coalesce(nullif(v.paper_pcv_number, ''), v.pcv_number) else v.pcv_number end as voucher,
         coalesce(w.id, 'fund:' || l.fund_id::text) as book_id,
         coalesce(w.name, f.name) as workbook_name,
         coalesce(w.active_sheet_id, 0) as sheet_id
  from public.liquidations l
  join public.vouchers v on v.id = l.voucher_id
  join public.funds f on f.id = l.fund_id
  left join lateral (
    select x.id, x.name, x.active_sheet_id from public.sheet_workbooks x
    where x.fund_id = l.fund_id and x.enabled order by x.id limit 1
  ) w on true
  where l.status = 'approved'
), lines as (
  -- the custodian's reviewed receipt lines are the final entries
  select a.*, r.position, r.expense_date, r.tag as category, r.particulars, r.supplier, r.plate, r.receipt_number,
         r.company, r.tin, ''::text as address, r.amount
  from approved a join public.liquidation_receipt_lines r on r.liquidation_id = a.liquidation_id
  union all
  -- an older liquidation has only the requester's lines
  select a.*, i.position, nullif(i.sheet_details->>'expense_date', '')::date,
         coalesce(nullif(i.sheet_details->>'sheet_category', ''), c.name, ''), i.particulars,
         coalesce(i.sheet_details->>'supplier', ''), coalesce(i.sheet_details->>'plate', ''),
         coalesce(i.sheet_details->>'receipt_number', ''), coalesce(i.sheet_details->>'company', ''),
         coalesce(i.sheet_details->>'tin', ''), coalesce(i.sheet_details->>'address', ''), i.amount
  from approved a
  join public.liquidation_items i on i.liquidation_id = a.liquidation_id
  left join public.categories c on c.id = i.category_id
  where not exists (select 1 from public.liquidation_receipt_lines r where r.liquidation_id = a.liquidation_id)
)
select
  book_id::text as book_id,
  sheet_id::int as sheet_id,
  (row_number() over (partition by fund_id order by reviewed_at, liquidation_id, position))::int as source_row,
  'App records'::text as sheet_name,
  expense_date::date as expense_date,
  voucher::text as voucher,
  category::text as category,
  particulars::text as particulars,
  employee_name::text as person,
  supplier::text as supplier,
  plate::text as plate,
  receipt_number::text as receipt_number,
  company::text as company,
  amount::numeric as amount,
  tin::text as tin,
  address::text as address,
  reviewed_by::uuid as custodian_id,
  (select p.full_name from public.profiles p where p.id = lines.reviewed_by)::text as custodian_name,
  workbook_name::text as workbook_name,
  null::text as spreadsheet_id,
  0::bigint as tab_order,
  true as active_tab,
  (liquidation_id::text || ':' || position::text)::text as match_key,
  1::bigint as occurrence,
  1::bigint as copy_rank,
  liquidation_id::uuid as liquidation_id
from lines;
-- Only the dashboard function below reads it (as its owner, after checking the caller's role).
revoke all on public.accounting_expenses_v from public, anon, authenticated;
grant select on public.accounting_expenses_v to service_role;

-- The records the dashboard works on: the app's own, or the Google Sheet copy shaped the same way.
create function public.accounting_source(p_source text) returns setof public.accounting_expenses_v
language sql stable security definer set search_path = public as $$
  select * from public.accounting_expenses_v where coalesce(p_source, 'database') <> 'sheet'
  union all
  select r.book_id::text, r.sheet_id::int, r.source_row::int, r.sheet_name::text, r.expense_date::date, r.voucher::text,
         r.category::text, r.particulars::text, r.person::text, r.supplier::text, r.plate::text, r.receipt_number::text,
         r.company::text, r.amount::numeric, r.tin::text, r.address::text, r.custodian_id::uuid, r.custodian_name::text,
         r.workbook_name::text, r.spreadsheet_id::text, r.tab_order::bigint, r.active_tab::boolean, r.match_key::text,
         r.occurrence::bigint, r.copy_rank::bigint, null::uuid
  from public.sheet_expense_reporting_v r where p_source = 'sheet'
$$;
revoke execute on function public.accounting_source(text) from public, anon, authenticated;
grant execute on function public.accounting_source(text) to service_role;

-- The dashboard itself: same filters, totals and shape, now reading accounting_source.
do $$
declare def text; fixed text;
begin
  select pg_get_functiondef('public.accounting_dashboard(jsonb,boolean)'::regprocedure) into def;
  fixed := replace(def, 'public.sheet_expense_reporting_v r', 'public.accounting_source(p_filters->>''source'') r');
  if fixed = def then raise exception 'Dashboard record source was not found'; end if;
  def := fixed;
  fixed := replace(def, 'from public.sheet_expenses where expense_date<=', 'from public.accounting_source(p_filters->>''source'') where expense_date<=');
  if fixed = def then raise exception 'Latest date source was not found'; end if;
  def := fixed;
  fixed := replace(def, 'from public.sheet_expenses e where', 'from public.accounting_source(p_filters->>''source'') e where');
  if fixed = def then raise exception 'Tag and company source was not found'; end if;
  def := fixed;
  fixed := replace(def, 'not exists(select 1 from public.sheet_workbooks where id=book)',
    'not exists(select 1 from public.sheet_workbooks where id=book) and not exists(select 1 from public.funds where ''fund:''||id::text=book)');
  if fixed = def then raise exception 'Workbook check was not found'; end if;
  execute fixed;
end $$;

-- The newest expense date inside a scope, for the "latest month" view.
create function public.accounting_latest_date(p_source text, p_book text, p_tab int, p_custodian text) returns date
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_role(array['admin', 'accounting']::public.user_role[]);
  return (select max(e.expense_date) from public.accounting_source(p_source) e
          where e.expense_date <= (now() at time zone 'Asia/Manila')::date
            and (p_book is null or e.book_id = p_book)
            and (p_tab is null or e.sheet_id = p_tab)
            and (p_custodian is null or (p_custodian = 'unassigned' and e.custodian_id is null) or e.custodian_id::text = p_custodian));
end $$;
revoke execute on function public.accounting_latest_date(text, text, int, text) from public, anon;
grant execute on function public.accounting_latest_date(text, text, int, text) to authenticated, service_role;
