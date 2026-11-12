-- Phase 38: security fixes from the November 2026 takeover review.
-- Every change narrows access; nothing the app uses today is removed.

-- 1. Voucher lines were readable by every signed-in user (phase 13 used
--    `using (true)`), so requesters and custodians of other funds could list
--    the particulars and amounts of every voucher. A line is now visible only
--    to someone who can see its voucher; the subquery runs under the caller's
--    own row-level security on public.vouchers (fund access).
drop policy if exists voucher_items_select on public.voucher_items;
create policy voucher_items_select on public.voucher_items
  for select to authenticated
  using (exists (select 1 from public.vouchers v where v.id = voucher_items.voucher_id));

-- 2. The phase 1 single-line RPC still let signed-in users create vouchers
--    outside save_workflow_voucher (no workflow flag, no paper numbering, no
--    pending category). The app no longer calls it; nothing else depends on it.
revoke execute on function public.create_voucher(uuid, text, text, numeric, uuid, date, text, text)
  from public, anon, authenticated;

-- 3. Reporting views inherited the platform's default write grants. They are
--    not updatable, so writes already failed, but the grants should not exist.
revoke insert, update, delete, truncate, references, trigger
  on public.replenishment_eligibility_v, public.sheet_expense_reporting_v
  from anon, authenticated;

-- 4. A voucher's preparer may update its photo paths directly (column grant +
--    RLS on their own draft). The server later reads those paths with its own
--    key (Google Drive copies), so a crafted path could pull another fund's
--    file. Photo paths must live in the voucher's own folder:
--    <fund_id>/<voucher_id>/<file>.
create or replace function public.guard_voucher_photo_paths()
returns trigger
language plpgsql set search_path = public as $$
declare
  prefix text := new.fund_id::text || '/' || new.id::text || '/';
begin
  if new.receipt_path is not null
     and new.receipt_path is distinct from (case when tg_op = 'UPDATE' then old.receipt_path end)
     and left(new.receipt_path, length(prefix)) <> prefix then
    raise exception 'The receipt photo does not belong to this voucher';
  end if;
  if new.paper_voucher_path is not null
     and new.paper_voucher_path is distinct from (case when tg_op = 'UPDATE' then old.paper_voucher_path end)
     and left(new.paper_voucher_path, length(prefix)) <> prefix then
    raise exception 'The paper voucher photo does not belong to this voucher';
  end if;
  return new;
end $$;

drop trigger if exists vouchers_guard_photo_paths on public.vouchers;
create trigger vouchers_guard_photo_paths
  before insert or update of receipt_path, paper_voucher_path on public.vouchers
  for each row execute function public.guard_voucher_photo_paths();
