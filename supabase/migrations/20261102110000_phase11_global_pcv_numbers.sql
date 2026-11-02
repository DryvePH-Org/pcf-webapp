-- Phase 11: voucher numbers must be unique across all funds (pcv_number has a
-- global unique constraint), but they were counted per fund, so a second fund
-- would restart at PCV-YYYY-0001 and collide.
-- DECISION: number vouchers sequentially across the whole system per year,
-- continuing from the highest number any fund has issued. Concurrent creations
-- are serialized per year with an advisory lock.
create or replace function public.next_pcv_number(p_fund_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
  v_no int;
begin
  perform pg_advisory_xact_lock(hashtext('pcv_number'), v_year);

  select coalesce(max(last_no), 0) + 1
  into v_no
  from public.fund_counters
  where year = v_year;

  insert into public.fund_counters (fund_id, year, last_no)
  values (p_fund_id, v_year, v_no)
  on conflict (fund_id, year) do update set last_no = excluded.last_no;

  return format('PCV-%s-%s', v_year, lpad(v_no::text, 4, '0'));
end $$;
