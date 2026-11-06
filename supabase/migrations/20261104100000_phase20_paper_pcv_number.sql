-- Phase 20: the PCV number printed on the paper voucher.
-- The app keeps generating its own PCV number (the unique internal reference).
-- When the paper voucher already carries a number, it is stored next to it as
-- paper_pcv_number, searchable and shown on the voucher, print sheet and emails.
-- A number can be used once per fund (voided vouchers free it), which also
-- catches the same paper voucher being entered twice.

alter table public.vouchers add column paper_pcv_number text;

alter table public.vouchers
  add constraint vouchers_paper_pcv_number_safe check (
    paper_pcv_number is null
    or (char_length(paper_pcv_number) <= 30 and paper_pcv_number ~ '^[A-Za-z0-9][A-Za-z0-9 ./#-]*$')
  ) not valid;

create unique index vouchers_paper_pcv_unique
  on public.vouchers (fund_id, upper(paper_pcv_number))
  where paper_pcv_number is not null and status <> 'void';

create or replace function public.clean_paper_pcv(
  p_value text,
  p_fund_id uuid,
  p_exclude uuid default null
) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v text := nullif(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '');
begin
  if v is null then
    return null;
  end if;
  if char_length(v) > 30 then
    raise exception 'The paper PCV number is too long (30 characters at most)';
  end if;
  if v !~ '^[A-Za-z0-9][A-Za-z0-9 ./#-]*$' then
    raise exception 'The paper PCV number can only use letters, numbers, spaces and . / # -';
  end if;
  if exists (
    select 1 from public.vouchers
    where fund_id = p_fund_id
      and status <> 'void'
      and upper(paper_pcv_number) = upper(v)
      and (p_exclude is null or id <> p_exclude)
  ) then
    raise exception 'A voucher with paper PCV number % already exists in this fund', v;
  end if;
  return v;
end $$;

revoke execute on function public.clean_paper_pcv(text, uuid, uuid) from public, anon, authenticated;

do $$
declare
  def text;
begin
  -- create_voucher_lines: new trailing parameter, normalised and stored.
  select pg_get_functiondef(p.oid) into def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'create_voucher_lines';
  drop function public.create_voucher_lines(uuid, text, jsonb, date, text, text);

  def := replace(def,
    'p_no_receipt_reason text DEFAULT NULL::text)',
    'p_no_receipt_reason text DEFAULT NULL::text, p_paper_pcv text DEFAULT NULL::text)');
  def := replace(def, E'declare\n', E'declare\n  v_paper text;\n');
  def := replace(def,
    E'  perform public.require_fund_access(p_fund_id);\n',
    E'  perform public.require_fund_access(p_fund_id);\n  v_paper := public.clean_paper_pcv(p_paper_pcv, p_fund_id, null);\n');
  def := replace(def,
    'status, receipt_path, no_receipt_reason, prepared_by',
    'status, receipt_path, no_receipt_reason, prepared_by, paper_pcv_number');
  def := replace(def,
    E'    auth.uid()\n  )\n  returning id into v_id;',
    E'    auth.uid(),\n    v_paper\n  )\n  returning id into v_id;');
  execute def;

  -- update_voucher_lines: same, and it replaces the stored number.
  select pg_get_functiondef(p.oid) into def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'update_voucher_lines';
  drop function public.update_voucher_lines(uuid, text, jsonb, date);

  def := replace(def,
    'p_voucher_date date DEFAULT CURRENT_DATE)',
    'p_voucher_date date DEFAULT CURRENT_DATE, p_paper_pcv text DEFAULT NULL::text)');
  def := replace(def, E'declare\n', E'declare\n  v_paper text;\n');
  def := replace(def,
    E'  perform public.require_fund_access(v_voucher.fund_id);\n',
    E'  perform public.require_fund_access(v_voucher.fund_id);\n  v_paper := public.clean_paper_pcv(p_paper_pcv, v_voucher.fund_id, p_id);\n');
  def := replace(def,
    'set payee = btrim(p_payee),',
    E'set payee = btrim(p_payee),\n      paper_pcv_number = v_paper,');
  execute def;
end $$;

revoke execute on function public.create_voucher_lines(uuid, text, jsonb, date, text, text, text) from public, anon;
grant execute on function public.create_voucher_lines(uuid, text, jsonb, date, text, text, text) to authenticated, service_role;
revoke execute on function public.update_voucher_lines(uuid, text, jsonb, date, text) from public, anon;
grant execute on function public.update_voucher_lines(uuid, text, jsonb, date, text) to authenticated, service_role;
