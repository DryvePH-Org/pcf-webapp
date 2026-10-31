-- Phase 1: every voucher and replenishment state change goes through these RPCs.
-- All are security definer, pin search_path, and validate role + current state.

create or replace function public.require_role(p_roles public.user_role[])
returns public.user_role
language plpgsql stable security definer set search_path = public as $$
declare
  v_role public.user_role := public.app_role();
begin
  if v_role is null or not (v_role = any(p_roles)) then
    raise exception 'Not authorized for this action';
  end if;
  return v_role;
end $$;

create or replace function public.create_voucher(
  p_fund_id uuid,
  p_payee text,
  p_particulars text,
  p_amount numeric,
  p_category_id uuid,
  p_voucher_date date default current_date,
  p_receipt_path text default null,
  p_no_receipt_reason text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_fund public.funds%rowtype;
  v_category public.categories%rowtype;
  v_id uuid;
begin
  perform public.require_role(array['custodian', 'admin']::public.user_role[]);

  if nullif(btrim(coalesce(p_payee, '')), '') is null then
    raise exception 'Payee is required';
  end if;
  if nullif(btrim(coalesce(p_particulars, '')), '') is null then
    raise exception 'Particulars are required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select * into v_fund from public.funds where id = p_fund_id and is_active;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;
  if p_amount > v_fund.per_txn_limit then
    raise exception 'Amount exceeds the per-transaction limit of %', v_fund.per_txn_limit;
  end if;

  select * into v_category from public.categories where id = p_category_id and is_active;
  if not found then
    raise exception 'Category not found or inactive';
  end if;

  insert into public.vouchers (
    fund_id, pcv_number, voucher_date, payee, particulars, amount, category_id,
    status, receipt_path, no_receipt_reason, prepared_by
  ) values (
    p_fund_id,
    public.next_pcv_number(p_fund_id),
    coalesce(p_voucher_date, current_date),
    btrim(p_payee),
    btrim(p_particulars),
    round(p_amount, 2),
    p_category_id,
    'draft',
    nullif(btrim(coalesce(p_receipt_path, '')), ''),
    nullif(btrim(coalesce(p_no_receipt_reason, '')), ''),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.submit_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_role public.user_role;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.user_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status not in ('draft', 'rejected') then
    raise exception 'Voucher cannot be submitted from status %', v_voucher.status;
  end if;
  if v_role = 'custodian' and v_voucher.prepared_by <> auth.uid() then
    raise exception 'You can only submit your own vouchers';
  end if;
  if nullif(btrim(coalesce(v_voucher.receipt_path, '')), '') is null
     and nullif(btrim(coalesce(v_voucher.no_receipt_reason, '')), '') is null then
    raise exception 'Attach a receipt or provide a no-receipt reason';
  end if;

  update public.vouchers
  set status = 'submitted', reject_reason = null
  where id = p_id;
end $$;

create or replace function public.approve_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
begin
  perform public.require_role(array['approver', 'admin']::public.user_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'submitted' then
    raise exception 'Voucher cannot be approved from status %', v_voucher.status;
  end if;
  if v_voucher.prepared_by = auth.uid() then
    raise exception 'You cannot approve a voucher you prepared';
  end if;

  update public.vouchers
  set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = p_id;
end $$;

create or replace function public.reject_voucher(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
begin
  perform public.require_role(array['approver', 'admin']::public.user_role[]);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'submitted' then
    raise exception 'Voucher cannot be rejected from status %', v_voucher.status;
  end if;

  update public.vouchers
  set status = 'rejected', reject_reason = btrim(p_reason)
  where id = p_id;
end $$;

create or replace function public.release_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_expected numeric;
begin
  perform public.require_role(array['custodian', 'admin']::public.user_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'approved' then
    raise exception 'Voucher cannot be released from status %', v_voucher.status;
  end if;

  -- Serialize releases per fund so two requests cannot both pass the cash check.
  perform 1 from public.funds where id = v_voucher.fund_id for update;

  select expected_cash into v_expected from public.fund_balance_v where fund_id = v_voucher.fund_id;
  if v_expected is null then
    raise exception 'Fund balance not found';
  end if;
  if v_voucher.amount > v_expected then
    raise exception 'Insufficient cash on hand: % available, % required', v_expected, v_voucher.amount;
  end if;

  update public.vouchers
  set status = 'released', released_at = now()
  where id = p_id;
end $$;

create or replace function public.void_voucher(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_role public.user_role;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.user_role[]);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A void reason is required';
  end if;

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status = 'closed' then
    raise exception 'Closed vouchers cannot be voided';
  end if;
  if v_role = 'custodian' then
    if v_voucher.prepared_by <> auth.uid() then
      raise exception 'You can only void your own vouchers';
    end if;
    if v_voucher.status not in ('draft', 'rejected') then
      raise exception 'Custodians can only void draft or rejected vouchers';
    end if;
  end if;

  -- DECISION: keep replenishment totals consistent by refusing to void a
  -- voucher that is currently bundled in a replenishment request.
  if v_voucher.replenishment_id is not null then
    raise exception 'Voucher is part of a replenishment request; review that request first';
  end if;

  update public.vouchers
  set status = 'void', void_reason = btrim(p_reason)
  where id = p_id;
end $$;

create or replace function public.create_replenishment(p_fund_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_total numeric(12,2);
  v_id uuid;
  v_no bigint;
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
begin
  perform public.require_role(array['custodian', 'admin']::public.user_role[]);

  perform 1 from public.funds where id = p_fund_id and is_active for update;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;

  select count(*), coalesce(sum(amount), 0)
  into v_count, v_total
  from public.vouchers
  where fund_id = p_fund_id
    and status = 'released'
    and replenishment_id is null;

  if v_count = 0 then
    raise exception 'No released vouchers are available to replenish';
  end if;

  v_no := nextval('public.replenishment_no_seq');

  insert into public.replenishments (fund_id, request_no, status, total, requested_by)
  values (
    p_fund_id,
    format('REP-%s-%s', v_year, lpad(v_no::text, 4, '0')),
    'draft',
    v_total,
    auth.uid()
  )
  returning id into v_id;

  update public.vouchers
  set replenishment_id = v_id
  where fund_id = p_fund_id
    and status = 'released'
    and replenishment_id is null;

  return v_id;
end $$;

create or replace function public.submit_replenishment(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_repl public.replenishments%rowtype;
  v_role public.user_role;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.user_role[]);

  select * into v_repl from public.replenishments where id = p_id for update;
  if not found then
    raise exception 'Replenishment not found';
  end if;
  if v_repl.status <> 'draft' then
    raise exception 'Replenishment cannot be submitted from status %', v_repl.status;
  end if;
  if v_role = 'custodian' and v_repl.requested_by <> auth.uid() then
    raise exception 'You can only submit your own replenishment requests';
  end if;

  update public.replenishments set status = 'submitted' where id = p_id;
end $$;

create or replace function public.review_replenishment(
  p_id uuid,
  p_approve boolean,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_repl public.replenishments%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.require_role(array['accounting', 'admin']::public.user_role[]);

  if p_approve is null then
    raise exception 'An approve/reject decision is required';
  end if;
  if not p_approve and v_note is null then
    raise exception 'A note is required when rejecting a replenishment';
  end if;

  select * into v_repl from public.replenishments where id = p_id for update;
  if not found then
    raise exception 'Replenishment not found';
  end if;
  if v_repl.status <> 'submitted' then
    raise exception 'Replenishment cannot be reviewed from status %', v_repl.status;
  end if;

  if p_approve then
    update public.replenishments
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
    where id = p_id;
  else
    update public.replenishments
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
    where id = p_id;

    update public.vouchers set replenishment_id = null where replenishment_id = p_id;
  end if;
end $$;

create or replace function public.close_replenishment(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_repl public.replenishments%rowtype;
begin
  perform public.require_role(array['accounting', 'admin']::public.user_role[]);

  select * into v_repl from public.replenishments where id = p_id for update;
  if not found then
    raise exception 'Replenishment not found';
  end if;
  if v_repl.status <> 'approved' then
    raise exception 'Replenishment cannot be closed from status %', v_repl.status;
  end if;
  if v_repl.reviewed_by is null then
    raise exception 'Replenishment must be reviewed before it can be closed';
  end if;

  update public.vouchers
  set status = 'closed'
  where replenishment_id = p_id and status = 'released';

  update public.replenishments set status = 'closed' where id = p_id;
end $$;

create or replace function public.record_cash_count(
  p_fund_id uuid,
  p_counted numeric,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_expected numeric;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  perform public.require_role(array['custodian', 'admin']::public.user_role[]);

  if p_counted is null or p_counted < 0 then
    raise exception 'Counted cash must be zero or more';
  end if;

  select expected_cash into v_expected from public.fund_balance_v where fund_id = p_fund_id;
  if v_expected is null then
    raise exception 'Fund not found';
  end if;

  if p_counted <> v_expected and v_note is null then
    raise exception 'A note is required when the counted cash differs from expected cash';
  end if;

  insert into public.cash_counts (fund_id, counted_cash, expected_cash, note, counted_by)
  values (p_fund_id, round(p_counted, 2), v_expected, v_note, auth.uid())
  returning id into v_id;

  return v_id;
end $$;
