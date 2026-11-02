-- Phase 11: email notifications.
-- notification_log records every email the app tries to send (written by the
-- server with the service role; only admins can read it). notification_recipients
-- resolves active users by role to their sign-in email, for the server only.

create table if not exists public.notification_log (
  id bigint generated always as identity primary key,
  event text not null,
  entity_type text,
  entity_id uuid,
  recipient_id uuid,
  recipient_email text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists notification_log_created_at_idx
  on public.notification_log (created_at desc);

alter table public.notification_log enable row level security;

drop policy if exists notification_log_select on public.notification_log;
create policy notification_log_select on public.notification_log
  for select to authenticated
  using ((select public.app_role()) = 'admin');

revoke all on table public.notification_log from anon, authenticated;
grant select on table public.notification_log to authenticated;

create or replace function public.notification_recipients(
  p_roles public.user_role[],
  p_include uuid[] default '{}',
  p_exclude uuid[] default '{}'
)
returns table (id uuid, email text, full_name text, role public.user_role)
language sql stable security definer set search_path = public, auth as $$
  select p.id, u.email::text, p.full_name, p.role
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.is_active
    and u.email is not null
    and (p.role = any (p_roles) or p.id = any (p_include))
    and not (p.id = any (p_exclude));
$$;

revoke execute on function public.notification_recipients(public.user_role[], uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function public.notification_recipients(public.user_role[], uuid[], uuid[])
  to service_role;
