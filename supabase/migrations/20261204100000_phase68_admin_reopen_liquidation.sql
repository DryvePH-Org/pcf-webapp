-- Phase 68: an administrator can send a submitted or approved liquidation back, or delete it, so it can be done again.
--
-- A liquidation filed wrongly could not be redone once it was submitted, and an approved one had also been written to
-- the Google Sheet. Fixing it meant editing the database by hand. Now an administrator does it from the liquidation
-- page, after typing their own password again, with a written reason. It is kept in a log nobody can edit.
--
--  * "Send back" returns the liquidation to a draft: the lines and pictures stay so the owner can correct and submit
--    again, and the custodian review, the approval and the sheet job are removed.
--  * "Delete" removes the liquidation completely; the advance is outstanding again and the owner starts a new one.
--  * Nothing is allowed when money has moved on: a cash return or reimbursement was recorded, the voucher is part of
--    a replenishment, or Grokbot is writing it right now. The page says which, so it is fixed first.
--
-- The functions can only be called by the server (service role) after it has checked the administrator's password.
-- The Google Sheet rows are cleared by Grokbot (a one-off message), not by this function.

create table public.admin_corrections (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  actor_name text not null,
  action text not null check (action in ('liquidation_reopened', 'liquidation_deleted')),
  target_type text not null check (target_type in ('liquidation')),
  target_id uuid not null,
  label text not null,
  reason text not null check (char_length(reason) between 5 and 300 and reason !~ '[\x01-\x1f\x7f<>]'),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_corrections_recent on public.admin_corrections(created_at desc);
alter table public.admin_corrections enable row level security;
revoke all on public.admin_corrections from anon, authenticated;
grant all on public.admin_corrections to service_role;
grant select on public.admin_corrections to authenticated;
create policy admin_corrections_read on public.admin_corrections for select to authenticated using (public.app_role() = 'admin');

-- What stops a liquidation from being sent back (empty when nothing does).
create function public.liquidation_reopen_blockers(p_id uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare l public.liquidations; v public.vouchers; out text[] := '{}';
begin
  select * into l from public.liquidations where id = p_id;
  if not found then return array['That liquidation was not found.']; end if;
  select * into v from public.vouchers where id = l.voucher_id;
  if exists (select 1 from public.cash_settlements where liquidation_id = l.id) then
    out := array_append(out, 'A cash return or reimbursement was already recorded for it. That money movement has to be sorted out first.'::text);
  end if;
  if l.reimbursement_approved_at is not null then
    out := array_append(out, 'A reimbursement was already approved for it.'::text);
  end if;
  if v.replenishment_id is not null or exists (select 1 from public.replenishment_items where liquidation_id = l.id or voucher_id = v.id) then
    out := array_append(out, 'It is already part of a replenishment. Take it out of the replenishment first.'::text);
  end if;
  if exists (select 1 from public.grokbot_operations where liquidation_id = l.id and status = 'running') then
    out := array_append(out, 'Grokbot is writing it to the sheet right now. Wait until it finishes, then try again.'::text);
  end if;
  return out;
end $$;
revoke execute on function public.liquidation_reopen_blockers(uuid) from public, anon, authenticated;
grant execute on function public.liquidation_reopen_blockers(uuid) to service_role;

create function public.admin_preview_liquidation_reopen(p_actor uuid, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l public.liquidations;
begin
  if not exists (select 1 from public.profiles where id = p_actor and is_active and role = 'admin') then
    raise exception 'Only an administrator can do this';
  end if;
  select * into l from public.liquidations where id = p_id;
  if not found then raise exception 'That liquidation was not found.'; end if;
  return jsonb_build_object(
    'pcv', l.pcv_number, 'owner', l.employee_name, 'status', l.status, 'spent', l.total_spent,
    'blockers', to_jsonb(public.liquidation_reopen_blockers(p_id)),
    'in_sheet', exists (select 1 from public.grokbot_operations where liquidation_id = l.id and kind = 'liquidation_approved' and status = 'completed')
  );
end $$;
revoke execute on function public.admin_preview_liquidation_reopen(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_preview_liquidation_reopen(uuid, uuid) to service_role;

create function public.admin_reopen_liquidation(p_actor uuid, p_id uuid, p_mode text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a record; l public.liquidations; blockers text[]; reason text := btrim(coalesce(p_reason, '')); in_sheet boolean;
begin
  select full_name, role into a from public.profiles where id = p_actor and is_active;
  if not found or a.role <> 'admin' then raise exception 'Only an administrator can do this'; end if;
  if p_mode not in ('draft', 'delete') then raise exception 'Choose to send it back or to delete it'; end if;
  if char_length(reason) < 5 then raise exception 'Write the reason (at least 5 characters)'; end if;

  select * into l from public.liquidations where id = p_id for update;
  if not found then raise exception 'That liquidation was not found.'; end if;
  perform 1 from public.vouchers where id = l.voucher_id for update;
  blockers := public.liquidation_reopen_blockers(p_id);
  if cardinality(blockers) > 0 then raise exception '%', blockers[1]; end if;
  in_sheet := exists (select 1 from public.grokbot_operations where liquidation_id = l.id and kind = 'liquidation_approved' and status = 'completed');

  -- the sheet side: its jobs, previews and the flags found when the sheet was read
  delete from public.sheet_edit_log where liquidation_id = l.id;
  delete from public.grokbot_operations where liquidation_id = l.id;
  delete from public.sheet_jobs where liquidation_id = l.id;
  delete from public.sheet_previews where liquidation_id = l.id;
  delete from public.liquidation_receipt_lines where liquidation_id = l.id;

  if p_mode = 'draft' then
    update public.liquidations
    set status = 'draft', reviewed_by = null, reviewer_name = null, reviewed_at = null, review_note = null,
        reimbursement_approved_by = null, reimbursement_approved_at = null,
        receipt_reviewed_by = null, receipt_review_revision = receipt_review_revision + 1
    where id = l.id;
  else
    delete from public.liquidation_items where liquidation_id = l.id;
    delete from public.liquidation_revisions where liquidation_id = l.id;
    delete from public.liquidations where id = l.id;
  end if;

  insert into public.admin_corrections(actor_id, actor_name, action, target_type, target_id, label, reason, details)
  values (p_actor, a.full_name, case when p_mode = 'draft' then 'liquidation_reopened' else 'liquidation_deleted' end,
          'liquidation', l.id, l.pcv_number, reason,
          jsonb_build_object('status_before', l.status, 'spent', l.total_spent, 'owner', l.employee_name, 'was_in_sheet', in_sheet));
  return jsonb_build_object('pcv', l.pcv_number, 'in_sheet', in_sheet, 'mode', p_mode);
end $$;
revoke execute on function public.admin_reopen_liquidation(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_reopen_liquidation(uuid, uuid, text, text) to service_role;
