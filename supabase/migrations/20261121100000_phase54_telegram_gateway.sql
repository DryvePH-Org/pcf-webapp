-- Phase 54: a Telegram gateway for budget requests.
-- A requester who finds the website hard to use sends a voice message to the company's Telegram bot, reviews the
-- summary it sends back, edits it if needed and taps Submit. It becomes an ordinary budget request, made by that
-- person, under exactly the same rules (limits, the approver step, repeats) as one made on the website.
--
-- Safety, all in the database:
--  * Only a person an administrator linked can use the bot. A link is made with a single-use code that expires.
--  * The request is created by one service-only function that acts as the linked person and calls the same
--    create_budget_request the website calls. There is no second set of rules.
--  * Everything the bot works on (drafts, links) is private to the server; nothing here is readable by users.

create table public.telegram_links (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  chat_id bigint not null unique,
  username text check (username is null or char_length(username) <= 100),
  linked_at timestamptz not null default now()
);
alter table public.telegram_links enable row level security;
revoke all on public.telegram_links from anon, authenticated;
grant select on public.telegram_links to authenticated;
grant all on public.telegram_links to service_role;
create policy telegram_links_admin_read on public.telegram_links for select to authenticated
  using (public.app_role() = 'admin');

create table public.telegram_link_codes (
  code_hash text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_link_codes from anon, authenticated;
grant all on public.telegram_link_codes to service_role;

-- One request being put together in a chat. Only one is open per chat at a time.
create table public.telegram_drafts (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  fund_id uuid references public.funds(id) on delete set null,
  amount numeric(12,2) check (amount is null or amount > 0),
  purpose text check (purpose is null or char_length(purpose) <= 300),
  transcript text check (transcript is null or char_length(transcript) <= 5000),
  status text not null default 'draft' check (status in ('draft', 'editing_amount', 'editing_purpose', 'submitted', 'cancelled')),
  request_id uuid references public.budget_requests(id) on delete set null,
  message_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index telegram_drafts_one_open on public.telegram_drafts(chat_id)
  where status in ('draft', 'editing_amount', 'editing_purpose');
create index telegram_drafts_request_idx on public.telegram_drafts(request_id) where request_id is not null;
alter table public.telegram_drafts enable row level security;
revoke all on public.telegram_drafts from anon, authenticated;
grant all on public.telegram_drafts to service_role;

-- Telegram resends an update until it is answered; this makes each one count once.
create table public.telegram_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);
alter table public.telegram_updates enable row level security;
revoke all on public.telegram_updates from anon, authenticated;
grant all on public.telegram_updates to service_role;

-- An administrator makes a single-use link code for a person (valid for 7 days). Only its hash is kept.
create function public.telegram_issue_link_code(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
begin
  perform public.require_role(array['admin']::public.user_role[]);
  perform 1 from public.profiles where id = p_user and is_active;
  if not found then raise exception 'That account is not active'; end if;
  delete from public.telegram_link_codes where profile_id = p_user and used_at is null;
  insert into public.telegram_link_codes(code_hash, profile_id, created_by, expires_at)
  values (encode(sha256(convert_to(code, 'UTF8')), 'hex'), p_user, auth.uid(), now() + interval '7 days');
  return code;
end $$;
revoke execute on function public.telegram_issue_link_code(uuid) from public, anon;
grant execute on function public.telegram_issue_link_code(uuid) to authenticated, service_role;

create function public.telegram_unlink(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role(array['admin']::public.user_role[]);
  delete from public.telegram_links where profile_id = p_user;
  delete from public.telegram_link_codes where profile_id = p_user and used_at is null;
  update public.telegram_drafts set status = 'cancelled', updated_at = now()
  where profile_id = p_user and status in ('draft', 'editing_amount', 'editing_purpose');
end $$;
revoke execute on function public.telegram_unlink(uuid) from public, anon;
grant execute on function public.telegram_unlink(uuid) to authenticated, service_role;

-- The person taps the link and the bot redeems the code. One chat belongs to one person, and the other way round.
create function public.telegram_redeem_link_code(p_code text, p_chat bigint, p_username text)
returns table(profile_id uuid, full_name text)
language plpgsql security definer set search_path = public as $$
declare c public.telegram_link_codes;
begin
  select * into c from public.telegram_link_codes
  where code_hash = encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex') for update;
  if not found or c.used_at is not null or c.expires_at < now() then
    raise exception 'This link has expired or was already used';
  end if;
  perform 1 from public.profiles p where p.id = c.profile_id and p.is_active;
  if not found then raise exception 'That account is not active'; end if;
  delete from public.telegram_links l where l.chat_id = p_chat or l.profile_id = c.profile_id;
  insert into public.telegram_links(profile_id, chat_id, username) values (c.profile_id, p_chat, left(p_username, 100));
  update public.telegram_link_codes set used_at = now() where code_hash = c.code_hash;
  return query select pr.id, pr.full_name from public.profiles pr where pr.id = c.profile_id;
end $$;
revoke execute on function public.telegram_redeem_link_code(text, bigint, text) from public, anon, authenticated;
grant execute on function public.telegram_redeem_link_code(text, bigint, text) to service_role;

-- The request, made as the linked person. This calls the same function the website calls, so every rule applies.
create function public.telegram_create_budget_request(p_user uuid, p_fund uuid, p_amount numeric, p_purpose text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare person text;
begin
  select pr.full_name into person from public.profiles pr where pr.id = p_user and pr.is_active;
  if not found then raise exception 'That account is not active'; end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  return public.create_budget_request(p_fund, person, p_amount, p_purpose);
end $$;
revoke execute on function public.telegram_create_budget_request(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.telegram_create_budget_request(uuid, uuid, numeric, text) to service_role;
