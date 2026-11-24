-- Phase 65: one voucher number, counted per fund, with the fund's letters in front (B-0001, D-0009, OPR-0001).
--
-- A voucher used to have two numbers: the app's own PCV-2026-0019, counted across every fund, and the "paper" number
-- typed by the custodian, which is the one written in the Google Sheet. Accounting compares the sheet with the app, so
-- the two had to match. Now there is one number. The database makes it, the sheet gets the same text, and the old
-- typed number is kept equal to it (so every place that reads the paper number shows the same thing).
--
-- Existing vouchers keep the digits the sheet already shows and only gain the fund's letters. The old app number is
-- kept in previous_number, so a search for it still finds the voucher. The Operations fund has one voucher, which had
-- picked up a number from another fund's sequence, so it starts again at OPR-0001.

alter table public.funds add column code text;
alter table public.vouchers add column previous_number text;

-- Letters for a fund: the first letters of its words, made unique by a digit when two funds would share them.
create function public.derive_fund_code(p_name text, p_exclude uuid) returns text
language plpgsql stable set search_path = public as $$
declare
  v_base text;
  v_code text;
  v_try int := 1;
begin
  select left(string_agg(upper(left(w, 1)), ''), 3) into v_base
  from regexp_split_to_table(regexp_replace(coalesce(p_name, ''), '[^A-Za-z ]', '', 'g'), ' +') w
  where w <> '';
  v_base := coalesce(nullif(v_base, ''), 'F');
  v_code := v_base;
  while exists (select 1 from public.funds where code = v_code and id is distinct from p_exclude) loop
    v_try := v_try + 1;
    v_code := left(v_base, 3) || v_try::text;
  end loop;
  return v_code;
end $$;
revoke execute on function public.derive_fund_code(text, uuid) from public, anon, authenticated;

update public.funds set code = 'B' where name ilike 'Buying%' and code is null;
update public.funds set code = 'D' where name ilike 'Dryve%' and code is null
  and not exists (select 1 from public.funds x where x.code = 'D');
update public.funds set code = 'OPR' where name ilike 'Operations%' and code is null
  and not exists (select 1 from public.funds x where x.code = 'OPR');
do $$
declare f record;
begin
  for f in select id, name from public.funds where code is null order by created_at, id loop
    update public.funds set code = public.derive_fund_code(f.name, f.id) where id = f.id;
  end loop;
end $$;

alter table public.funds alter column code set not null;
alter table public.funds add constraint funds_code_format check (code ~ '^[A-Z][A-Z0-9]{0,3}$');
create unique index funds_code_unique on public.funds (code);

create function public.fund_code_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.code is null then
    new.code := public.derive_fund_code(new.name, new.id);
  end if;
  return new;
end $$;
-- a before-insert trigger runs ahead of the not-null check, so a fund made without a code still gets one
create trigger funds_code_default before insert on public.funds for each row execute function public.fund_code_default();

-- Renumber the existing vouchers: keep the digits already in the sheet, in creation order for any that clash or have none.
with ranked as (
  select v.id, v.fund_id, v.created_at, f.code,
         case when v.flow_version = 2 and f.code <> 'OPR' and v.paper_pcv_number ~ '^[0-9]{1,6}$' then v.paper_pcv_number::int end as cand
  from public.vouchers v join public.funds f on f.id = v.fund_id
), keep as (
  select r.*, row_number() over (partition by r.fund_id, r.cand order by r.created_at, r.id) as rn from ranked r
), fixed as (
  select id, fund_id, code, cand as no from keep where cand is not null and rn = 1
), rest as (
  select k.id, k.fund_id, k.code, row_number() over (partition by k.fund_id order by k.created_at, k.id) as ord
  from keep k where not (k.cand is not null and k.rn = 1)
), base as (
  select fund_id, max(no) as mx from fixed group by fund_id
), numbered as (
  select id, code, no from fixed
  union all
  select r.id, r.code, coalesce(b.mx, 0) + r.ord from rest r left join base b on b.fund_id = r.fund_id
)
update public.vouchers v
set previous_number = v.pcv_number,
    pcv_number = n.code || '-' || lpad(n.no::text, greatest(4, length(n.no::text)), '0'),
    paper_pcv_number = n.code || '-' || lpad(n.no::text, greatest(4, length(n.no::text)), '0')
from numbered n
where n.id = v.id;

update public.liquidations l set pcv_number = v.pcv_number from public.vouchers v where v.id = l.voucher_id;

-- The next number of a fund: one more than its highest, never reused (a voided voucher keeps its number).
create or replace function public.next_pcv_number(p_fund_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_no int;
begin
  perform pg_advisory_xact_lock(hashtext('pcv_number'), hashtext(p_fund_id::text));
  select code into v_code from public.funds where id = p_fund_id;
  if v_code is null then raise exception 'Fund not found'; end if;
  select coalesce(max(substring(pcv_number from '[0-9]+$')::int), 0) + 1 into v_no
  from public.vouchers where fund_id = p_fund_id and pcv_number like v_code || '-%';
  return v_code || '-' || lpad(v_no::text, greatest(4, length(v_no::text)), '0');
end $$;

-- What the form shows as the number the voucher will get.
create or replace function public.suggest_voucher_number(p_fund uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role(array['admin','custodian','approver']::public.user_role[]);
  perform public.require_fund_access(p_fund);
  return public.next_pcv_number(p_fund);
end $$;

-- The number the paper voucher and the sheet carry is the voucher's own number, whatever a form sends.
create function public.voucher_number_is_paper_number() returns trigger
language plpgsql set search_path = public as $$
begin
  new.paper_pcv_number := new.pcv_number;
  return new;
end $$;
create trigger vouchers_paper_number before insert or update of pcv_number, paper_pcv_number on public.vouchers
  for each row execute function public.voucher_number_is_paper_number();
