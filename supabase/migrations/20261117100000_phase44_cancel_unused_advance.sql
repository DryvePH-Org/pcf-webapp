-- Phase 44: cancel an advance that was never used, without deleting anything.
-- Until now released cash could only be settled through a liquidation, so an advance that was
-- never spent needed a zero-value liquidation. A custodian (or the fund's assigned approver, or an
-- administrator) can now cancel it with a reason. The voucher is kept, marked void, and its budget
-- request is closed as cancelled. The cash counts as returned only once the return is recorded:
-- until then the fund shows it as "returns due", so the money never disappears from the books.
-- Nothing is written to the Google Sheet because no expense happened.
-- Who may do it follows the liquidation rules: a custodian cannot cancel her own advance unless the
-- fund lets custodians approve their own (phase 40); then it is audited like any self-approval.

create table public.advance_cancellations (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null unique references public.vouchers(id),
  request_id uuid references public.budget_requests(id) on delete set null,
  fund_id uuid not null references public.funds(id),
  amount numeric(12,2) not null check (amount > 0),
  reason_code text not null check (reason_code in ('plan_changed','not_needed','paid_another_way','other')),
  note text check (char_length(note) <= 300 and note !~ '[\x01-\x1f\x7f<>]'),
  cancelled_by uuid not null references public.profiles(id),
  canceller_name text not null,
  cancelled_at timestamptz not null default now(),
  returned_on date,
  returned_recorded_by uuid references public.profiles(id),
  returner_name text,
  returned_recorded_at timestamptz,
  check ((returned_on is null) = (returned_recorded_by is null))
);
create index advance_cancellations_fund_idx on public.advance_cancellations(fund_id);

alter table public.advance_cancellations enable row level security;
revoke all on public.advance_cancellations from anon, authenticated;
grant select on public.advance_cancellations to authenticated;
grant all on public.advance_cancellations to service_role;
create policy advance_cancellations_read on public.advance_cancellations for select to authenticated
  using (exists (select 1 from public.vouchers v where v.id = voucher_id));
create trigger advance_cancellations_audit after insert or update or delete on public.advance_cancellations
  for each row execute function public.log_audit();

-- ------------------------------------------------------------------ helpers
-- The employee who received the advance.
create function public.advance_owner(p_voucher uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(r.requester_id, v.prepared_by) from public.vouchers v
  left join public.budget_requests r on r.id = v.budget_request_id where v.id = p_voucher;
$$;

-- Null when the signed-in user may cancel or settle this advance, otherwise the reason why not.
create function public.advance_cancel_gate(p_fund uuid, p_owner uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare r_role public.user_role := public.app_role();
begin
  if r_role is null then return 'Sign in first'; end if;
  if r_role = 'admin' then return null; end if;
  if r_role = 'custodian' then
    if not public.can_access_fund(p_fund) then return 'This fund is not assigned to you'; end if;
    if p_owner = auth.uid() and not public.self_approval_allowed(p_fund, p_owner) then
      return 'Your own advance is cancelled by another custodian, the fund''s assigned approver or an administrator';
    end if;
    return null;
  end if;
  if r_role = 'approver' then
    if p_owner <> auth.uid() and public.approver_reviews_owner(p_fund, p_owner) then return null; end if;
    return 'An approver handles a custodian''s own advance in the funds they are assigned to';
  end if;
  return 'Only a custodian, the assigned approver or an administrator can cancel an advance';
end $$;

-- Null when this voucher's advance can still be cancelled, otherwise the reason why not.
create function public.advance_cancel_blocker(p_voucher uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v public.vouchers%rowtype; l public.liquidations%rowtype;
begin
  select * into v from public.vouchers where id = p_voucher;
  if not found then return 'Voucher not found'; end if;
  if exists (select 1 from public.advance_cancellations where voucher_id = p_voucher) then return 'This advance is already cancelled'; end if;
  if v.released_at is null then return 'The cash has not been released, so void the voucher instead'; end if;
  if v.status not in ('released','approved','rejected') then return 'This voucher is already ' || v.status; end if;
  if v.replenishment_id is not null then return 'This voucher is already part of a replenishment'; end if;
  select * into l from public.liquidations where voucher_id = p_voucher;
  if found and (l.status <> 'draft' or l.revision > 0) then return 'A liquidation was already filed for this advance'; end if;
  return null;
end $$;

-- ------------------------------------------------- what the page needs to know
create function public.advance_cancellation_state(p_voucher uuid)
returns table(can_cancel boolean, can_record_return boolean, blocked text, cancelled boolean, returned boolean,
  amount numeric, reason_code text, note text, cancelled_at timestamptz, canceller_name text, returned_on date, returner_name text)
language plpgsql stable security definer set search_path = public as $$
declare v public.vouchers%rowtype; c public.advance_cancellations%rowtype; owner uuid; gate text; blk text;
begin
  if public.app_role() is null then raise exception 'Sign in first'; end if;
  select * into v from public.vouchers where id = p_voucher;
  if not found then return; end if;
  owner := public.advance_owner(p_voucher);
  if not (owner = auth.uid() or public.can_access_fund(v.fund_id)) then return; end if;
  gate := public.advance_cancel_gate(v.fund_id, owner);
  select * into c from public.advance_cancellations where voucher_id = p_voucher;
  if c.id is not null then
    return query select false, (c.returned_on is null and gate is null), null::text, true, c.returned_on is not null,
      c.amount, c.reason_code, c.note, c.cancelled_at, c.canceller_name, c.returned_on, c.returner_name;
  else
    blk := public.advance_cancel_blocker(p_voucher);
    return query select (blk is null and gate is null), false, coalesce(blk, gate), false, false,
      null::numeric, null::text, null::text, null::timestamptz, null::text, null::date, null::text;
  end if;
end $$;

-- ------------------------------------------------------------------- actions
create function public.cancel_unused_advance(p_voucher uuid, p_reason text, p_note text, p_cash_back boolean, p_returned_on date)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vouchers%rowtype; owner uuid; gate text; blk text; who text; label text;
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  perform public.require_role(array['custodian','approver','admin']::public.user_role[]);
  select * into v from public.vouchers where id = p_voucher for update;
  if not found then raise exception 'Voucher not found'; end if;
  perform public.require_fund_access(v.fund_id);
  owner := public.advance_owner(p_voucher);
  gate := public.advance_cancel_gate(v.fund_id, owner);
  if gate is not null then raise exception '%', gate; end if;
  blk := public.advance_cancel_blocker(p_voucher);
  if blk is not null then raise exception '%', blk; end if;
  label := case p_reason when 'plan_changed' then 'plan changed' when 'not_needed' then 'no longer needed'
    when 'paid_another_way' then 'paid another way' when 'other' then 'other' end;
  if label is null then raise exception 'Choose why the advance was not used'; end if;
  if p_reason = 'other' and nullif(btrim(p_note), '') is null then raise exception 'Explain why in the note'; end if;
  if p_cash_back is null then raise exception 'Say whether the cash is back in the box'; end if;
  if p_cash_back then
    if p_returned_on is null then raise exception 'Enter the date the cash came back'; end if;
    if p_returned_on > today then raise exception 'The return date cannot be in the future'; end if;
    if p_returned_on < (v.released_at at time zone 'Asia/Manila')::date then raise exception 'The cash cannot come back before it was released'; end if;
  end if;
  select full_name into who from public.profiles where id = auth.uid();
  insert into public.advance_cancellations(voucher_id, request_id, fund_id, amount, reason_code, note, cancelled_by, canceller_name,
    returned_on, returned_recorded_by, returner_name, returned_recorded_at)
  values (v.id, v.budget_request_id, v.fund_id, v.amount, p_reason, nullif(btrim(p_note), ''), auth.uid(), who,
    case when p_cash_back then p_returned_on end, case when p_cash_back then auth.uid() end,
    case when p_cash_back then who end, case when p_cash_back then now() end);
  update public.vouchers set status = 'void',
    void_reason = left('Advance not used (' || label || ')' || coalesce(': ' || nullif(btrim(p_note), ''), ''), 300)
  where id = v.id;
  update public.budget_requests set status = 'cancelled' where id = v.budget_request_id and status = 'voucher_created';
  if owner = auth.uid() then
    perform public.audit_self_approval('vouchers', v.id, jsonb_build_object('action', 'cancel_unused_advance'));
  end if;
end $$;

-- The cash of a cancelled advance came back after the cancellation was entered.
create function public.record_cancelled_advance_return(p_voucher uuid, p_returned_on date) returns void
language plpgsql security definer set search_path = public as $$
declare v public.vouchers%rowtype; c public.advance_cancellations%rowtype; owner uuid; gate text; who text;
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  perform public.require_role(array['custodian','approver','admin']::public.user_role[]);
  select * into v from public.vouchers where id = p_voucher for update;
  if not found then raise exception 'Voucher not found'; end if;
  perform public.require_fund_access(v.fund_id);
  owner := public.advance_owner(p_voucher);
  gate := public.advance_cancel_gate(v.fund_id, owner);
  if gate is not null then raise exception '%', gate; end if;
  select * into c from public.advance_cancellations where voucher_id = p_voucher for update;
  if c.id is null then raise exception 'This advance was not cancelled'; end if;
  if c.returned_on is not null then raise exception 'The return is already recorded'; end if;
  if p_returned_on is null then raise exception 'Enter the date the cash came back'; end if;
  if p_returned_on > today then raise exception 'The return date cannot be in the future'; end if;
  if p_returned_on < (v.released_at at time zone 'Asia/Manila')::date then raise exception 'The cash cannot come back before it was released'; end if;
  select full_name into who from public.profiles where id = auth.uid();
  update public.advance_cancellations set returned_on = p_returned_on, returned_recorded_by = auth.uid(),
    returner_name = who, returned_recorded_at = now() where id = c.id;
  if owner = auth.uid() then
    perform public.audit_self_approval('vouchers', v.id, jsonb_build_object('action', 'record_cancelled_advance_return'));
  end if;
end $$;

revoke execute on function public.advance_owner(uuid), public.advance_cancel_gate(uuid, uuid), public.advance_cancel_blocker(uuid)
  from public, anon, authenticated;
revoke execute on function public.advance_cancellation_state(uuid), public.cancel_unused_advance(uuid, text, text, boolean, date),
  public.record_cancelled_advance_return(uuid, date) from public, anon;
grant execute on function public.advance_cancellation_state(uuid), public.cancel_unused_advance(uuid, text, text, boolean, date),
  public.record_cancelled_advance_return(uuid, date) to authenticated, service_role;

-- --------------------------------------------- released cash may be voided only this way
do $$
declare def text; fixed text;
begin
  select pg_get_functiondef('public.guard_liquidated_voucher()'::regprocedure) into def;
  fixed := replace(def, 'old.released_at is not null then raise exception ''Released cash cannot be voided; settle it through liquidation'';',
    'old.released_at is not null and not exists(select 1 from public.advance_cancellations c where c.voucher_id=old.id) then raise exception ''Released cash cannot be voided; settle it through liquidation'';');
  if fixed = def then raise exception 'Void guard was not found'; end if;
  execute fixed;
end $$;

-- ------------------------------------------------------------------ the balance
-- A cancelled advance stays "out" until its return is recorded, and then shows as a return due.
create or replace view public.fund_balance_v with(security_invoker=true) as
select f.id as fund_id,f.name,f.amount as fund_amount,
  coalesce(sum(v.amount-case when s.kind='return' then s.amount when s.kind='reimbursement' then -s.amount else 0 end),0)::numeric(12,2) as released_vouchers_total,
  (f.amount-coalesce(sum(v.amount-case when s.kind='return' then s.amount when s.kind='reimbursement' then -s.amount else 0 end),0))::numeric(12,2) as expected_cash,
  (f.amount-coalesce(sum(v.amount-case when s.kind='return' then s.amount when s.kind='reimbursement' then -s.amount else 0 end),0))<f.amount*f.low_balance_pct/100.0 as is_low,
  coalesce(sum(v.amount) filter(where l.status is distinct from 'approved' and v.status<>'void'),0)::numeric(12,2) as advances_pending_liquidation,
  (coalesce(sum(greatest(l.amount_received-l.total_spent,0)) filter(where l.status='approved' and s.id is null),0)
   +coalesce(sum(v.amount) filter(where v.status='void'),0))::numeric(12,2) as returns_due,
  coalesce(sum(greatest(l.total_spent-l.amount_received,0)) filter(where l.status='approved' and s.id is null),0)::numeric(12,2) as reimbursements_due
from public.funds f left join public.vouchers v on v.fund_id=f.id and v.released_at is not null
  and (v.status in ('released','approved','rejected')
       or (v.status='void' and exists(select 1 from public.advance_cancellations c where c.voucher_id=v.id and c.returned_on is null)))
left join public.liquidations l on l.voucher_id=v.id left join public.cash_settlements s on s.voucher_id=v.id
group by f.id,f.name,f.amount;

-- ------------------------------------------------ the administrator's data reset
-- A reset deletes vouchers, so it must clear their cancellations first.
do $$
declare def text; fixed text;
begin
  select pg_get_functiondef('public.execute_data_deletion(uuid,text)'::regprocedure) into def;
  fixed := replace(def, 'delete from cash_settlements where voucher_id=any(vids);',
    'delete from cash_settlements where voucher_id=any(vids); delete from advance_cancellations where voucher_id=any(vids);');
  if fixed = def then raise exception 'Data reset cash settlement delete was not found'; end if;
  execute fixed;
end $$;
