-- Phase 12: approval before release for larger vouchers.
-- Each fund has an approval_threshold (default 3,000). A voucher whose amount
-- is at or above it must be approved BEFORE cash is released:
--   draft -> submitted -> approved (released_at still null) -> released_at set
-- Smaller vouchers keep the release-first flow:
--   draft -> released -> approved
-- A pre-approved voucher is status 'approved'; whether its cash is out is
-- decided by released_at, which fund_balance_v already respects.

alter table public.funds
  add column if not exists approval_threshold numeric(12,2) not null default 3000
  check (approval_threshold > 0);

alter table public.vouchers
  add column if not exists submitted_at timestamptz;

create or replace function public.requires_pre_approval(p_fund_id uuid, p_amount numeric)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p_amount >= f.approval_threshold from public.funds f where f.id = p_fund_id),
    false
  );
$$;

revoke execute on function public.requires_pre_approval(uuid, numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- submitting
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
  if v_voucher.status <> 'draft' then
    raise exception 'Only drafts can be submitted for approval';
  end if;
  if v_role = 'custodian' and v_voucher.prepared_by <> auth.uid() then
    raise exception 'You can only submit your own vouchers';
  end if;
  perform public.require_fund_access(v_voucher.fund_id);

  if not public.requires_pre_approval(v_voucher.fund_id, v_voucher.amount) then
    raise exception 'This voucher is below the approval threshold; release it directly';
  end if;
  if nullif(btrim(coalesce(v_voucher.receipt_path, '')), '') is null
     and nullif(btrim(coalesce(v_voucher.no_receipt_reason, '')), '') is null then
    raise exception 'Attach a receipt or provide a no-receipt reason';
  end if;

  update public.vouchers
  set status = 'submitted', submitted_at = now(), reject_reason = null
  where id = p_id;
end $$;

revoke execute on function public.submit_voucher(uuid) from public, anon;
grant execute on function public.submit_voucher(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------- approving
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
  if v_voucher.status not in ('submitted', 'released', 'rejected') then
    raise exception 'Voucher cannot be approved from status %', v_voucher.status;
  end if;
  if v_voucher.prepared_by = auth.uid() then
    raise exception 'You cannot approve a voucher you prepared';
  end if;

  -- For a submitted voucher released_at stays null: approving only clears the
  -- custodian to hand over the cash.
  update public.vouchers
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      reject_reason = null
  where id = p_id;
end $$;

-- Declines a request before any cash moved: it goes back to the custodian as
-- a draft, with the reason attached.
create or replace function public.return_voucher(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
begin
  perform public.require_role(array['approver', 'admin']::public.user_role[]);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required';
  end if;

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'submitted' then
    raise exception 'Only vouchers awaiting approval can be returned';
  end if;
  if v_voucher.prepared_by = auth.uid() then
    raise exception 'You cannot return a voucher you prepared';
  end if;

  update public.vouchers
  set status = 'draft', submitted_at = null, reject_reason = btrim(p_reason)
  where id = p_id;
end $$;

revoke execute on function public.return_voucher(uuid, text) from public, anon;
grant execute on function public.return_voucher(uuid, text) to authenticated, service_role;

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
  if v_voucher.status not in ('released', 'approved') then
    raise exception 'Voucher cannot be flagged from status %', v_voucher.status;
  end if;
  if v_voucher.released_at is null then
    raise exception 'Voucher has not been released yet; return or void it instead';
  end if;

  -- The cash is already out, so the voucher stays counted until it is voided
  -- or corrected. Only the flag and its reason change here.
  update public.vouchers
  set status = 'rejected', reject_reason = btrim(p_reason)
  where id = p_id;
end $$;

-- ----------------------------------------------------------------- releasing
create or replace function public.release_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_role public.user_role;
  v_expected numeric;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.user_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;

  if v_voucher.status = 'approved' and v_voucher.released_at is null then
    null; -- pre-approved: cash can go out now
  elsif v_voucher.status = 'draft' then
    if public.requires_pre_approval(v_voucher.fund_id, v_voucher.amount) then
      raise exception 'This voucher needs approver approval before cash can be released; submit it for approval first';
    end if;
  elsif v_voucher.status = 'submitted' then
    raise exception 'This voucher is still waiting for approval';
  else
    raise exception 'Voucher cannot be released from status %', v_voucher.status;
  end if;

  if v_role = 'custodian' and v_voucher.prepared_by <> auth.uid() then
    raise exception 'You can only release your own vouchers';
  end if;
  perform public.require_fund_access(v_voucher.fund_id);
  if nullif(btrim(coalesce(v_voucher.receipt_path, '')), '') is null
     and nullif(btrim(coalesce(v_voucher.no_receipt_reason, '')), '') is null then
    raise exception 'Attach a receipt or provide a no-receipt reason';
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

  if v_voucher.status = 'approved' then
    update public.vouchers set released_at = now() where id = p_id;
  else
    update public.vouchers
    set status = 'released', released_at = now(), reject_reason = null
    where id = p_id;
  end if;
end $$;

-- -------------------------------------------------------------------- voiding
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
    if v_voucher.status not in ('draft', 'submitted') then
      raise exception 'Custodians can only void drafts or requests awaiting approval; ask an admin to void released vouchers';
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

-- ------------------------------------------------------------- replenishments
-- Only vouchers whose cash actually left the fund are reimbursed: a
-- pre-approved voucher that has not been released yet is status 'approved' too.
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
  perform public.require_fund_access(p_fund_id);

  perform 1 from public.funds where id = p_fund_id and is_active for update;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;

  select count(*), coalesce(sum(amount), 0)
  into v_count, v_total
  from public.vouchers
  where fund_id = p_fund_id
    and status in ('released', 'approved', 'rejected')
    and released_at is not null
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
    and status in ('released', 'approved', 'rejected')
    and released_at is not null
    and replenishment_id is null;

  return v_id;
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

  -- DECISION: replenishment close does not wait for voucher approvals, so a
  -- slow approver never blocks restoring the fund.
  update public.vouchers
  set status = 'closed'
  where replenishment_id = p_id
    and status in ('released', 'approved', 'rejected')
    and released_at is not null;

  update public.replenishments set status = 'closed' where id = p_id;
end $$;
