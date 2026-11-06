-- Request discovery exposes fund/custodian names, never another fund's ledger.
create or replace function public.can_access_fund(p_fund_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('admin', 'approver', 'accounting')
    or (public.app_role() = 'custodian' and exists (
      select 1 from public.fund_custodians where fund_id = p_fund_id and custodian_id = auth.uid()
    )), false);
$$;

create or replace function public.require_fund_access(p_fund_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_access_fund(p_fund_id) then
    if public.app_role() = 'custodian' then raise exception 'You are not a custodian of this fund'; end if;
    raise exception 'You do not have access to this fund';
  end if;
end $$;

-- Requesters do not get the organisation's profile or fund assignment directory.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.app_role() is not null and (id = auth.uid() or public.app_role() <> 'requester'));
drop policy fund_custodians_select on public.fund_custodians;
create policy fund_custodians_select on public.fund_custodians for select to authenticated
  using (public.app_role() in ('admin', 'custodian', 'approver', 'accounting'));

create table public.budget_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  requester_id uuid not null references public.profiles(id),
  requester_name text not null check (char_length(btrim(requester_name)) between 1 and 100 and requester_name !~ '[\x01-\x1f\x7f<>]'),
  fund_id uuid not null references public.funds(id),
  fund_name text not null,
  amount numeric(12,2) not null check (amount > 0),
  purpose text not null check (char_length(btrim(purpose)) between 1 and 300 and purpose !~ '[\x01-\x1f\x7f<>]'),
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'cancelled', 'voucher_created')),
  reviewed_by uuid references public.profiles(id),
  reviewer_name text,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 300 and review_note !~ '[\x01-\x1f\x7f<>]'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index budget_requests_requester_idx on public.budget_requests(requester_id, created_at desc);
create index budget_requests_fund_status_idx on public.budget_requests(fund_id, status, created_at);
alter table public.budget_requests enable row level security;
revoke all on public.budget_requests from anon, authenticated;
grant select on public.budget_requests to authenticated;
grant all on public.budget_requests to service_role;
create policy budget_requests_select on public.budget_requests for select to authenticated using (
  public.app_role() is not null and (
    requester_id = auth.uid() or public.app_role() in ('admin', 'accounting')
    or (public.app_role() = 'custodian' and public.can_access_fund(fund_id))
  )
);
create trigger budget_requests_updated before update on public.budget_requests
  for each row execute function public.set_updated_at();
create trigger budget_requests_audit after insert or update on public.budget_requests
  for each row execute function public.log_audit();

alter table public.vouchers add column budget_request_id uuid unique references public.budget_requests(id);
-- Authenticated users have no grant to edit the new linkage column.

create or replace function public.list_request_funds()
returns table(id uuid, name text, custodian_names text[])
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_role(array['admin','custodian','approver','accounting','requester']::public.user_role[]);
  return query select f.id, f.name, array_agg(p.full_name order by p.full_name)
    from public.funds f join public.fund_custodians fc on fc.fund_id = f.id
    join public.profiles p on p.id = fc.custodian_id and p.is_active and p.role = 'custodian'
    where f.is_active group by f.id, f.name order by f.name;
end $$;

create or replace function public.create_budget_request(p_fund_id uuid, p_name text, p_amount numeric, p_purpose text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_name text;
begin
  perform public.require_role(array['admin','custodian','approver','accounting','requester']::public.user_role[]);
  select f.name into v_name from public.funds f where f.id = p_fund_id and f.is_active
    and exists (select 1 from public.fund_custodians fc join public.profiles p on p.id = fc.custodian_id
      where fc.fund_id = f.id and p.is_active and p.role = 'custodian');
  if not found then raise exception 'Choose an active fund with an assigned custodian'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 9999999999.99 then
    raise exception 'Enter a valid budget greater than zero with at most two decimals';
  end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_purpose), '') is null then
    raise exception 'Name and purpose are required';
  end if;
  insert into public.budget_requests(id, request_no, requester_id, requester_name, fund_id, fund_name, amount, purpose)
    values (v_id, 'BR-' || upper(v_id::text), auth.uid(), btrim(p_name), p_fund_id, v_name, p_amount, btrim(p_purpose));
  return v_id;
end $$;

create or replace function public.review_budget_request(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.budget_requests%rowtype; v_role public.user_role; v_name text;
begin
  v_role := public.require_role(array['custodian','admin']::public.user_role[]);
  select * into r from public.budget_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'submitted' then raise exception 'Only submitted requests can be reviewed'; end if;
  if r.requester_id = auth.uid() then raise exception 'You cannot review your own request'; end if;
  perform public.require_fund_access(r.fund_id);
  if p_approve is null then raise exception 'Choose approve or reject'; end if;
  if not p_approve and nullif(btrim(p_note), '') is null then raise exception 'A rejection reason is required'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.budget_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewer_name = v_name, reviewed_at = now(), review_note = nullif(btrim(p_note), '') where id = p_id;
end $$;

create or replace function public.cancel_budget_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.budget_requests%rowtype;
begin
  perform public.require_role(array['admin','custodian','approver','accounting','requester']::public.user_role[]);
  select * into r from public.budget_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.requester_id <> auth.uid() and public.app_role() <> 'admin' then raise exception 'Only the requester or an admin can cancel'; end if;
  if r.status not in ('submitted','approved') then raise exception 'This request can no longer be cancelled'; end if;
  update public.budget_requests set status = 'cancelled' where id = p_id;
end $$;

create or replace function public.create_voucher_from_request(
  p_request_id uuid, p_items jsonb, p_voucher_date date default current_date, p_no_receipt_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare r public.budget_requests%rowtype; v_id uuid; v_total numeric;
begin
  perform public.require_role(array['custodian','admin']::public.user_role[]);
  select * into r from public.budget_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'approved' then raise exception 'Approve this request before creating its voucher'; end if;
  if r.requester_id = auth.uid() then raise exception 'Another custodian must prepare your requested voucher'; end if;
  perform public.require_fund_access(r.fund_id);
  -- Existing voucher validation and limits run inside the same transaction.
  v_id := public.create_voucher_lines(r.fund_id, r.requester_name, p_items, p_voucher_date, null, p_no_receipt_reason);
  select amount into v_total from public.vouchers where id = v_id;
  if v_total > r.amount then raise exception 'Voucher total exceeds the approved budget'; end if;
  update public.vouchers set budget_request_id = r.id where id = v_id;
  update public.budget_requests set status = 'voucher_created' where id = r.id;
  return v_id;
end $$;

-- Requesters can see only a summary of their linked voucher, not the fund ledger.
create or replace function public.request_voucher_summary(p_request_id uuid)
returns table(id uuid, pcv_number text, amount numeric, status public.voucher_status, released_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.app_role() is null or not exists (
    select 1 from public.budget_requests r where r.id = p_request_id and (
      r.requester_id = auth.uid() or public.app_role() in ('admin','accounting')
      or (public.app_role() = 'custodian' and public.can_access_fund(r.fund_id))
    )
  ) then raise exception 'Request not found'; end if;
  return query select v.id, v.pcv_number, v.amount, v.status, v.released_at from public.vouchers v where v.budget_request_id = p_request_id;
end $$;

revoke execute on function public.list_request_funds() from public, anon;
revoke execute on function public.create_budget_request(uuid,text,numeric,text) from public, anon;
revoke execute on function public.review_budget_request(uuid,boolean,text) from public, anon;
revoke execute on function public.cancel_budget_request(uuid) from public, anon;
revoke execute on function public.create_voucher_from_request(uuid,jsonb,date,text) from public, anon;
revoke execute on function public.request_voucher_summary(uuid) from public, anon;
grant execute on function public.list_request_funds(), public.create_budget_request(uuid,text,numeric,text),
  public.review_budget_request(uuid,boolean,text), public.cancel_budget_request(uuid),
  public.create_voucher_from_request(uuid,jsonb,date,text), public.request_voucher_summary(uuid)
  to authenticated, service_role;

-- Keep the approved ceiling and request/fund linkage valid when drafts are edited.
create or replace function public.protect_request_voucher() returns trigger
language plpgsql set search_path = public as $$
declare r public.budget_requests%rowtype;
begin
  if current_user in ('anon','authenticated') and new.budget_request_id is distinct from old.budget_request_id then
    raise exception 'The budget request link cannot be edited directly';
  end if;
  if new.budget_request_id is not null then
    select * into r from public.budget_requests where id = new.budget_request_id;
    if not found or new.fund_id <> r.fund_id or new.amount > r.amount then
      raise exception 'Voucher total exceeds the approved budget or its fund does not match';
    end if;
  end if;
  return new;
end $$;
create trigger vouchers_request_guard before update on public.vouchers
  for each row execute function public.protect_request_voucher();
