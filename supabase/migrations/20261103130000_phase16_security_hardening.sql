-- Phase 16: security hardening.
-- 1. Text columns get length limits and may not contain control characters, so
--    even a direct database write cannot store oversized or binary-ish input.
--    Constraints are NOT VALID: they apply to every new or changed row without
--    failing on historical data.
-- 2. A small fixed-window rate limiter used by the app for sign-in codes,
--    code checks and receipt scans.

do $$
declare
  spec text[];
  specs text[][] := array[
    ['profiles',       'full_name',         '100'],
    ['funds',          'name',              '80'],
    ['categories',     'name',              '60'],
    ['vouchers',       'payee',             '120'],
    ['vouchers',       'particulars',       '500'],
    ['vouchers',       'no_receipt_reason', '300'],
    ['vouchers',       'reject_reason',     '300'],
    ['vouchers',       'void_reason',       '300'],
    ['voucher_items',  'particulars',       '300'],
    ['replenishments', 'review_note',       '300'],
    ['cash_counts',    'note',              '300']
  ];
begin
  foreach spec slice 1 in array specs loop
    execute format(
      'alter table public.%I add constraint %I check (%I is null or (char_length(%I) <= %s and %I !~ %L)) not valid',
      spec[1], spec[1] || '_' || spec[2] || '_safe_text', spec[2], spec[2], spec[3], spec[2],
      '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
    );
  end loop;
end $$;

create table public.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Counts one hit for `p_key` and says whether it is still within the limit.
create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz;
  v_hits int;
begin
  if p_key is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit call';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (key, window_start, hits)
  values (left(p_key, 200), v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- Occasionally sweep old windows so the table stays tiny.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end $$;

revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
