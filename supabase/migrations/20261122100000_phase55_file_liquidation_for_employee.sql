-- Phase 55: a custodian files the liquidation for an employee who cannot use the website.
--
-- Only the person who received the cash could start, edit and submit a liquidation. Someone who finds the website
-- hard (the people the Telegram bot is for) could not do their part at all. Now a custodian assigned to the fund,
-- or an administrator, can file it for them: the liquidation still belongs to the employee, the person who filed it
-- is recorded on it (and shown on its page and in its history), and the employee is told.
--
-- Who may review it:
--  * A custodian of the fund who filed it MAY review and approve it herself. Every time, an audit record is written
--    ("filed and reviewed by the same custodian") and administrators are told, as with any self-approval.
--  * An administrator who filed it may NOT review it; another custodian, the approver or another administrator does.
--  * An extra reimbursement (spending above the cash received and above the fund's limits) is never approved by the
--    person who filed the liquidation; the independent approver does that.
-- Replenishment is still approved by accounting and then an approver, whoever filed the liquidations in it.

alter table public.liquidations add column filed_by uuid references public.profiles(id) on delete set null;
alter table public.liquidations add column filed_by_name text check (filed_by_name is null or char_length(filed_by_name) <= 100);

-- Who may file for the employee of this voucher: a custodian of the fund (or an administrator), for an open voucher
-- with cash released and nothing filed yet, when the advance is someone else's.
create function public.can_file_liquidation_for(p_voucher uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v public.vouchers%rowtype; c record;
begin
  if public.app_role() not in ('custodian', 'admin') then return false; end if;
  select * into v from public.vouchers where id = p_voucher;
  if not found or v.released_at is null or v.status in ('void', 'closed') or v.replenishment_id is not null then return false; end if;
  if not public.can_access_fund(v.fund_id) then return false; end if;
  select * into c from public.liquidation_context(p_voucher);
  return found and c.liquidation_id is null and c.owner_id is distinct from auth.uid();
end $$;
revoke execute on function public.can_file_liquidation_for(uuid) from public, anon;
grant execute on function public.can_file_liquidation_for(uuid) to authenticated, service_role;

-- Start the liquidation for the employee. It is the employee's liquidation; filed_by says who is doing it for them.
create function public.create_liquidation_for(p_voucher_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v public.vouchers%rowtype; c record; lid uuid; filer text;
begin
  perform public.require_role(array['custodian', 'admin']::public.user_role[]);
  select * into v from public.vouchers where id = p_voucher_id for update;
  if not found then raise exception 'Voucher not found'; end if;
  perform public.require_fund_access(v.fund_id);
  select * into c from public.liquidation_context(p_voucher_id);
  if not found then raise exception 'Voucher not found'; end if;
  if c.owner_id = auth.uid() then raise exception 'This advance is yours. File it from your own form'; end if;
  if c.liquidation_id is not null then return c.liquidation_id; end if;
  if v.released_at is null or v.status in ('void', 'closed') or v.replenishment_id is not null then
    raise exception 'Liquidation requires an open voucher with cash released';
  end if;
  select full_name into filer from public.profiles where id = auth.uid();
  insert into public.liquidations(voucher_id, fund_id, owner_id, employee_name, amount_received, pcv_number, fund_name, filed_by, filed_by_name)
  values (v.id, v.fund_id, c.owner_id, c.employee_name, v.amount, c.pcv_number, c.fund_name, auth.uid(), filer)
  returning id into lid;
  insert into public.liquidation_items(liquidation_id, position, particulars, amount, category_id)
  select lid, position, particulars, amount, category_id from public.voucher_items where voucher_id = v.id;
  if not found then
    insert into public.liquidation_items(liquidation_id, position, particulars, amount, category_id)
    values (lid, 1, v.particulars, v.amount, v.category_id);
  end if;
  update public.liquidations
  set total_spent = (select coalesce(sum(amount), 0) from public.liquidation_items where liquidation_id = lid),
      employee_name = p.full_name
  from public.profiles p
  where liquidations.id = lid and p.id = liquidations.owner_id;
  return lid;
end $$;
revoke execute on function public.create_liquidation_for(uuid) from public, anon;
grant execute on function public.create_liquidation_for(uuid) to authenticated, service_role;

-- Editing a draft (and fixing a flagged one) belongs to the employee and to whoever filed it for them. This one
-- function gates saving, submitting and uploading receipts, so all three follow it.
create or replace function public.can_edit_liquidation(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_role() is not null and exists(
    select 1 from public.liquidations l join public.vouchers v on v.id = l.voucher_id
    where l.id = p_id
      and (l.owner_id = auth.uid() or (l.filed_by = auth.uid() and public.can_access_fund(l.fund_id)))
      and l.status in ('draft', 'flagged') and v.status not in ('void', 'closed') and v.replenishment_id is null);
$$;

-- The rules above, enforced on every change to a liquidation, whatever function made it.
create function public.guard_liquidation_filer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.filed_by is not null and new.filed_by <> new.owner_id then
    if new.reimbursement_approved_by is distinct from old.reimbursement_approved_by and new.reimbursement_approved_by = new.filed_by then
      raise exception 'The person who filed this liquidation for the employee cannot approve its extra reimbursement. The approver must';
    end if;
    if (new.reviewed_by is distinct from old.reviewed_by and new.reviewed_by = new.filed_by)
       or (new.receipt_reviewed_by is distinct from old.receipt_reviewed_by and new.receipt_reviewed_by = new.filed_by) then
      if not public.is_fund_custodian_user(new.fund_id, new.filed_by) then
        raise exception 'Only a custodian of this fund can review a liquidation she filed for the employee. Another custodian, the approver or an administrator must';
      end if;
      -- allowed, and always on record
      if new.reviewed_by is distinct from old.reviewed_by and new.reviewed_by = new.filed_by then
        perform public.audit_self_approval('liquidations', new.id, jsonb_build_object(
          'step', 'filed_and_reviewed_by_same_custodian', 'decision', new.status, 'filed_by', new.filed_by,
          'employee', new.owner_id, 'fund_id', new.fund_id, 'amount', new.total_spent));
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger liquidations_filer_guard before update on public.liquidations
  for each row execute function public.guard_liquidation_filer();
