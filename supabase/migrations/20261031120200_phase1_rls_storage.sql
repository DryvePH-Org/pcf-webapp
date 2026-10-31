-- Phase 1: Row Level Security, protected-column guards, grants, and storage policies.

-- ---------------------------------------------------------------- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (public.app_role() = 'admin');

create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------- funds, categories
create policy funds_select on public.funds
  for select to authenticated
  using (true);

create policy funds_admin_insert on public.funds
  for insert to authenticated
  with check (public.app_role() = 'admin');

create policy funds_admin_update on public.funds
  for update to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

create policy categories_select on public.categories
  for select to authenticated
  using (true);

create policy categories_admin_insert on public.categories
  for insert to authenticated
  with check (public.app_role() = 'admin');

create policy categories_admin_update on public.categories
  for update to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

-- ---------------------------------------------------- vouchers (read + limited edit)
create policy vouchers_select on public.vouchers
  for select to authenticated
  using (true);

-- Custodians may edit the descriptive fields of their own draft/rejected
-- vouchers. Status and workflow columns are guarded by the trigger below and
-- by the column-level UPDATE grant at the end of this file.
create policy vouchers_custodian_update on public.vouchers
  for update to authenticated
  using (prepared_by = auth.uid() and status in ('draft', 'rejected'))
  with check (prepared_by = auth.uid() and status in ('draft', 'rejected'));

-- ---------------------------------------------------------- replenishments, counts
create policy replenishments_select on public.replenishments
  for select to authenticated
  using (true);

create policy cash_counts_select on public.cash_counts
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------- audit log
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.app_role() in ('admin', 'accounting'));

-- ------------------------------------------------- protected-column triggers
-- These are intentionally invoker-security functions: inside an RPC (security
-- definer) current_user is the function owner, while a direct PostgREST write
-- arrives as `authenticated`. That lets us tell the two paths apart.

create or replace function public.protect_voucher_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.status is distinct from old.status
       or new.fund_id is distinct from old.fund_id
       or new.pcv_number is distinct from old.pcv_number
       or new.prepared_by is distinct from old.prepared_by
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.released_at is distinct from old.released_at
       or new.reject_reason is distinct from old.reject_reason
       or new.void_reason is distinct from old.void_reason
       or new.replenishment_id is distinct from old.replenishment_id
       or new.created_at is distinct from old.created_at
       or new.updated_at is distinct from old.updated_at then
      raise exception 'Voucher status and workflow fields can only be changed through voucher actions';
    end if;

    if new.amount is distinct from old.amount then
      if new.amount <= 0 then
        raise exception 'Amount must be greater than zero';
      end if;
      if new.amount > (select per_txn_limit from public.funds where id = old.fund_id) then
        raise exception 'Amount exceeds the per-transaction limit';
      end if;
    end if;
  end if;

  return new;
end $$;

-- Alphabetical trigger order matters: vouchers_protect_columns runs before
-- vouchers_set_updated_at, so a client-supplied updated_at is still rejected.
create trigger vouchers_protect_columns
  before update on public.vouchers
  for each row execute function public.protect_voucher_columns();

create or replace function public.protect_profile_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated')
     and public.app_role() is distinct from 'admin' then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.id is distinct from old.id
       or new.created_at is distinct from old.created_at then
      raise exception 'Only admins can change a role or active status';
    end if;
  end if;

  return new;
end $$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Suppress linter warnings and evaluate the view's underlying RLS as the caller.
alter view public.fund_balance_v set (security_invoker = true);

-- ------------------------------------------------------------------ grants
-- RLS decides which rows; grants decide which operations PostgREST may attempt.
revoke all on table
  public.profiles,
  public.funds,
  public.categories,
  public.fund_counters,
  public.replenishments,
  public.vouchers,
  public.cash_counts,
  public.audit_log
from anon, authenticated;

revoke all on public.fund_balance_v from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on table
  public.profiles,
  public.funds,
  public.categories,
  public.replenishments,
  public.vouchers,
  public.cash_counts,
  public.audit_log
to authenticated;

grant select on public.fund_balance_v to authenticated;

grant insert, update on public.profiles to authenticated;
grant insert, update on public.funds to authenticated;
grant insert, update on public.categories to authenticated;

-- Direct edits are limited to the descriptive voucher columns.
grant update (payee, particulars, amount, category_id, receipt_path, no_receipt_reason, voucher_date)
  on public.vouchers to authenticated;

-- Functions: remove the implicit PUBLIC grant, then allow signed-in users to
-- call the RPC surface. Helpers stay internal.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.app_role() to authenticated;

grant execute on function public.create_voucher(uuid, text, text, numeric, uuid, date, text, text) to authenticated;
grant execute on function public.submit_voucher(uuid) to authenticated;
grant execute on function public.approve_voucher(uuid) to authenticated;
grant execute on function public.reject_voucher(uuid, text) to authenticated;
grant execute on function public.release_voucher(uuid) to authenticated;
grant execute on function public.void_voucher(uuid, text) to authenticated;
grant execute on function public.create_replenishment(uuid) to authenticated;
grant execute on function public.submit_replenishment(uuid) to authenticated;
grant execute on function public.review_replenishment(uuid, boolean, text) to authenticated;
grant execute on function public.close_replenishment(uuid) to authenticated;
grant execute on function public.record_cash_count(uuid, numeric, text) to authenticated;

grant execute on function public.app_role() to service_role;
grant execute on function public.create_voucher(uuid, text, text, numeric, uuid, date, text, text) to service_role;
grant execute on function public.submit_voucher(uuid) to service_role;
grant execute on function public.approve_voucher(uuid) to service_role;
grant execute on function public.reject_voucher(uuid, text) to service_role;
grant execute on function public.release_voucher(uuid) to service_role;
grant execute on function public.void_voucher(uuid, text) to service_role;
grant execute on function public.create_replenishment(uuid) to service_role;
grant execute on function public.submit_replenishment(uuid) to service_role;
grant execute on function public.review_replenishment(uuid, boolean, text) to service_role;
grant execute on function public.close_replenishment(uuid) to service_role;
grant execute on function public.record_cash_count(uuid, numeric, text) to service_role;

-- ----------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy receipts_read on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts');

create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.app_role() in ('custodian', 'admin')
  );
