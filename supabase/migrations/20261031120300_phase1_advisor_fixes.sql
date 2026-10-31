-- Phase 1 advisor fixes: pin the timestamp trigger's search_path and evaluate
-- auth helpers once per query inside RLS policies.

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- profiles: collapse admin/self UPDATE into one policy and cache auth lookups.
drop policy profiles_admin_insert on public.profiles;
drop policy profiles_admin_update on public.profiles;
drop policy profiles_self_update on public.profiles;

create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check ((select public.app_role()) = 'admin');

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.app_role()) = 'admin')
  with check (id = (select auth.uid()) or (select public.app_role()) = 'admin');

drop policy funds_admin_insert on public.funds;
drop policy funds_admin_update on public.funds;

create policy funds_admin_insert on public.funds
  for insert to authenticated
  with check ((select public.app_role()) = 'admin');

create policy funds_admin_update on public.funds
  for update to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

drop policy categories_admin_insert on public.categories;
drop policy categories_admin_update on public.categories;

create policy categories_admin_insert on public.categories
  for insert to authenticated
  with check ((select public.app_role()) = 'admin');

create policy categories_admin_update on public.categories
  for update to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

drop policy vouchers_custodian_update on public.vouchers;

create policy vouchers_custodian_update on public.vouchers
  for update to authenticated
  using (
    prepared_by = (select auth.uid())
    and status in ('draft', 'rejected')
  )
  with check (
    prepared_by = (select auth.uid())
    and status in ('draft', 'rejected')
  );

drop policy audit_log_select on public.audit_log;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select public.app_role()) in ('admin', 'accounting'));

drop policy receipts_read on storage.objects;
drop policy receipts_insert on storage.objects;

create policy receipts_read on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts');

create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (select public.app_role()) in ('custodian', 'admin')
  );
