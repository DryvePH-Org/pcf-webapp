-- Phase 41: in-app notifications and email preferences.
-- Every notification is stored for the person it is for (the bell and the
-- notifications page read it). Writes happen only from the server with the
-- service role; people can read their own and mark them read.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event text not null check (char_length(event) between 1 and 80),
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 500),
  link_path text check (link_path is null or (char_length(link_path) <= 300 and link_path ~ '^/[A-Za-z0-9/_?=&.%-]*$')),
  tone text not null default 'info' check (tone in ('info', 'action', 'alert', 'success')),
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());

create function public.mark_notifications_read(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  update public.notifications set read_at = now()
    where user_id = auth.uid() and read_at is null and id = any(coalesce(p_ids, '{}'));
end $$;

create function public.mark_all_notifications_read() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
end $$;

-- Read ones are kept 30 days, anything is kept at most 90 days.
create function public.prune_notifications() returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from public.notifications
    where created_at < now() - interval '90 days'
       or (read_at is not null and read_at < now() - interval '30 days');
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke execute on function public.mark_notifications_read(uuid[]), public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read(uuid[]), public.mark_all_notifications_read() to authenticated, service_role;
revoke execute on function public.prune_notifications() from public, anon, authenticated;
grant execute on function public.prune_notifications() to service_role;

-- Email preferences. In-app notifications are always on.
create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_actions boolean not null default true,
  email_digest boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;
create policy notification_preferences_select_own on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());

create function public.set_notification_preferences(p_email_actions boolean, p_email_digest boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.app_role() is null then raise exception 'Sign in first'; end if;
  if p_email_actions is null or p_email_digest is null then raise exception 'Choose on or off'; end if;
  insert into public.notification_preferences(user_id, email_actions, email_digest)
    values (auth.uid(), p_email_actions, p_email_digest)
    on conflict (user_id) do update
      set email_actions = excluded.email_actions, email_digest = excluded.email_digest, updated_at = now();
end $$;
revoke execute on function public.set_notification_preferences(boolean, boolean) from public, anon;
grant execute on function public.set_notification_preferences(boolean, boolean) to authenticated, service_role;
