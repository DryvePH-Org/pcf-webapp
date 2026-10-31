-- Release-first workflow: the custodian hands out cash immediately and the
-- approver reviews afterwards. Status now means:
--   draft -> released (cash out, awaiting review) -> approved (reviewed) -> closed
-- `rejected` is a post-release flag: the cash stays counted and the custodian
-- or an admin must correct or void the voucher. `void` stays terminal.

-- Normalize rows created under the old submit/approve-first flow. Rows that
-- never had cash released go back to draft; rows released after approval are
-- marked reviewed so they do not reappear in the approver queue.
update public.vouchers
set status = 'draft', reject_reason = null
where status = 'submitted';

update public.vouchers
set status = 'draft', reject_reason = null
where status in ('approved', 'rejected')
  and released_at is null;

update public.vouchers
set status = 'approved'
where status = 'released'
  and approved_at is not null;

-- Cash now leaves the fund before approval; the separate submit step is gone.
drop function if exists public.submit_voucher(uuid);

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
  if v_voucher.status <> 'draft' then
    raise exception 'Voucher cannot be released from status %', v_voucher.status;
  end if;
  if v_role = 'custodian' and v_voucher.prepared_by <> auth.uid() then
    raise exception 'You can only release your own vouchers';
  end if;
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

  update public.vouchers
  set status = 'released', released_at = now(), reject_reason = null
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
  if v_voucher.status not in ('released', 'rejected') then
    raise exception 'Voucher cannot be approved from status %', v_voucher.status;
  end if;
  if v_voucher.prepared_by = auth.uid() then
    raise exception 'You cannot approve a voucher you prepared';
  end if;

  update public.vouchers
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      reject_reason = null
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
  if v_voucher.status not in ('released', 'approved') then
    raise exception 'Voucher cannot be flagged from status %', v_voucher.status;
  end if;

  -- The cash is already out, so the voucher stays counted until it is voided
  -- or corrected. Only the flag and its reason change here.
  update public.vouchers
  set status = 'rejected', reject_reason = btrim(p_reason)
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
    if v_voucher.status <> 'draft' then
      raise exception 'Custodians can only void drafts; ask an admin to void released vouchers';
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
    and status in ('released', 'approved', 'rejected')
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
    and status in ('released', 'approved', 'rejected');

  update public.replenishments set status = 'closed' where id = p_id;
end $$;

-- Cash is out for released, approved, and post-release rejected vouchers.
create or replace view public.fund_balance_v as
select
  f.id as fund_id,
  f.name,
  f.amount as fund_amount,
  coalesce(sum(v.amount) filter (
    where v.status in ('released', 'approved', 'rejected')
      and v.released_at is not null
  ), 0)::numeric(12,2) as released_vouchers_total,
  (f.amount - coalesce(sum(v.amount) filter (
    where v.status in ('released', 'approved', 'rejected')
      and v.released_at is not null
  ), 0))::numeric(12,2) as expected_cash,
  (
    f.amount - coalesce(sum(v.amount) filter (
      where v.status in ('released', 'approved', 'rejected')
        and v.released_at is not null
    ), 0)
  ) < f.amount * f.low_balance_pct / 100.0 as is_low
from public.funds f
left join public.vouchers v on v.fund_id = f.id
group by f.id, f.name, f.amount, f.low_balance_pct;

alter view public.fund_balance_v set (security_invoker = true);

-- Direct edits stay limited to drafts: a released voucher is a financial
-- record and must go through the review or void RPCs.
drop policy if exists vouchers_custodian_update on public.vouchers;
create policy vouchers_custodian_update on public.vouchers
  for update to authenticated
  using (prepared_by = auth.uid() and status = 'draft')
  with check (prepared_by = auth.uid() and status = 'draft');
