-- Phase 1: enums, tables, helpers, triggers, and the live balance view.

create type public.user_role as enum ('admin', 'custodian', 'approver', 'accounting');
create type public.voucher_status as enum ('draft', 'submitted', 'approved', 'released', 'closed', 'rejected', 'void');
create type public.replenishment_status as enum ('draft', 'submitted', 'approved', 'rejected', 'closed');

-- DECISION: request numbers need a race-free counter; the plan only requires
-- `request_no` to be unique, so a plain sequence backs REP-YYYY-NNNN.
create sequence public.replenishment_no_seq start 1;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'custodian',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.funds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  per_txn_limit numeric(12,2) not null check (per_txn_limit > 0),
  low_balance_pct int not null default 25 check (low_balance_pct between 1 and 100),
  custodian_id uuid references public.profiles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true
);

create table public.fund_counters (
  fund_id uuid not null references public.funds(id),
  year int not null,
  last_no int not null default 0,
  primary key (fund_id, year)
);

create table public.replenishments (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id),
  request_no text not null unique,
  status public.replenishment_status not null default 'draft',
  total numeric(12,2) not null default 0,
  requested_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id),
  pcv_number text not null unique,
  voucher_date date not null default current_date,
  payee text not null,
  particulars text not null,
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid not null references public.categories(id),
  status public.voucher_status not null default 'draft',
  receipt_path text,
  no_receipt_reason text,
  prepared_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  released_at timestamptz,
  reject_reason text,
  void_reason text,
  replenishment_id uuid references public.replenishments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vouchers_fund_status_idx on public.vouchers (fund_id, status);
create index vouchers_date_idx on public.vouchers (voucher_date);
create index vouchers_replenishment_idx on public.vouchers (replenishment_id);

create table public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id),
  counted_cash numeric(12,2) not null check (counted_cash >= 0),
  expected_cash numeric(12,2) not null,
  variance numeric(12,2) generated always as (counted_cash - expected_cash) stored,
  note text,
  counted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.funds enable row level security;
alter table public.categories enable row level security;
alter table public.fund_counters enable row level security;
alter table public.replenishments enable row level security;
alter table public.vouchers enable row level security;
alter table public.cash_counts enable row level security;
alter table public.audit_log enable row level security;

create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

-- DECISION: the fund year follows the app timezone, Asia/Manila, per plan rule 9.
create or replace function public.next_pcv_number(p_fund_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
  v_no int;
begin
  insert into public.fund_counters (fund_id, year, last_no)
  values (p_fund_id, v_year, 1)
  on conflict (fund_id, year)
    do update set last_no = public.fund_counters.last_no + 1
  returning last_no into v_no;

  return format('PCV-%s-%s', v_year, lpad(v_no::text, 4, '0'));
end $$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger vouchers_set_updated_at
  before update on public.vouchers
  for each row execute function public.set_updated_at();

create or replace function public.log_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_action text := lower(tg_op);
  v_entity_id uuid;
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(old) ->> 'status') is distinct from (to_jsonb(new) ->> 'status') then
    v_action := 'status_change';
  end if;

  v_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;

  insert into public.audit_log (entity_type, entity_id, action, actor_id, old_data, new_data)
  values (
    tg_table_name,
    v_entity_id,
    v_action,
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger vouchers_audit
  after insert or update or delete on public.vouchers
  for each row execute function public.log_audit();
create trigger replenishments_audit
  after insert or update or delete on public.replenishments
  for each row execute function public.log_audit();
create trigger funds_audit
  after insert or update or delete on public.funds
  for each row execute function public.log_audit();
create trigger cash_counts_audit
  after insert or update or delete on public.cash_counts
  for each row execute function public.log_audit();
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.log_audit();

create or replace view public.fund_balance_v as
select
  f.id as fund_id,
  f.name,
  f.amount as fund_amount,
  coalesce(sum(v.amount) filter (where v.status = 'released'), 0)::numeric(12,2) as released_vouchers_total,
  (f.amount - coalesce(sum(v.amount) filter (where v.status = 'released'), 0))::numeric(12,2) as expected_cash,
  (
    f.amount - coalesce(sum(v.amount) filter (where v.status = 'released'), 0)
  ) < f.amount * f.low_balance_pct / 100.0 as is_low
from public.funds f
left join public.vouchers v on v.fund_id = f.id
group by f.id, f.name, f.amount, f.low_balance_pct;
