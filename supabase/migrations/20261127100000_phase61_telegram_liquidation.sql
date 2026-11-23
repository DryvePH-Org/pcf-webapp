-- Phase 61: filing a liquidation through the Telegram bot.
-- An employee sends a photo of each receipt to the bot, says what it was for, reviews the total and taps Submit. It
-- becomes an ordinary liquidation made by that person: the same functions, the same checks, and the same custodian
-- review as one filed on the website.
--
-- Safety, all in the database:
--  * Only a linked, active person can use it (the existing telegram_links).
--  * The liquidation is created, saved and submitted by service-only functions that act as the linked person and call
--    the website's own create_liquidation, save_liquidation and submit_liquidation. There is no second set of rules.
--  * What the bot works on while the person is still taking pictures lives in two private tables nobody can read
--    through the API. Nothing reaches the real liquidation until Submit.

create table public.telegram_liq_drafts (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  voucher_id uuid references public.vouchers(id) on delete set null,
  liquidation_id uuid references public.liquidations(id) on delete set null,
  department text not null default '' check (char_length(department) <= 100 and department !~ '[\x01-\x1f\x7f<>]'),
  status text not null default 'draft' check (status in
    ('choosing', 'draft', 'editing_particulars', 'editing_amount', 'editing_department', 'submitted', 'cancelled')),
  edit_line uuid,
  message_id bigint,
  -- a receipt photo sent before the person chose which advance it belongs to
  pending_file text check (pending_file is null or char_length(pending_file) <= 300),
  pending_caption text check (pending_caption is null or char_length(pending_caption) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index telegram_liq_drafts_one_open on public.telegram_liq_drafts(chat_id)
  where status in ('choosing', 'draft', 'editing_particulars', 'editing_amount', 'editing_department');
create index telegram_liq_drafts_profile_idx on public.telegram_liq_drafts(profile_id);
alter table public.telegram_liq_drafts enable row level security;
revoke all on public.telegram_liq_drafts from anon, authenticated;
grant all on public.telegram_liq_drafts to service_role;

create table public.telegram_liq_lines (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.telegram_liq_drafts(id) on delete cascade,
  particulars text not null default '' check (char_length(particulars) <= 300 and particulars !~ '[\x01-\x1f\x7f<>]'),
  amount numeric(12,2) check (amount is null or amount > 0),
  receipt_path text check (receipt_path is null or char_length(receipt_path) <= 300),
  -- what reading the receipt picture suggested, kept to warn when the typed amount differs
  read_amount numeric(12,2) check (read_amount is null or read_amount > 0),
  reading boolean not null default false,
  created_at timestamptz not null default now()
);
create index telegram_liq_lines_draft_idx on public.telegram_liq_lines(draft_id, created_at);
alter table public.telegram_liq_lines enable row level security;
revoke all on public.telegram_liq_lines from anon, authenticated;
grant all on public.telegram_liq_lines to service_role;

create function public.telegram_act_as(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles pr where pr.id = p_user and pr.is_active) then
    raise exception 'That account is not active';
  end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;
revoke execute on function public.telegram_act_as(uuid) from public, anon, authenticated;
grant execute on function public.telegram_act_as(uuid) to service_role;

-- Starts (or finds the existing draft of) the liquidation of one advance, as the linked person.
create function public.telegram_create_liquidation(p_user uuid, p_voucher uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform public.telegram_act_as(p_user);
  return public.create_liquidation(p_voucher);
end $$;
revoke execute on function public.telegram_create_liquidation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.telegram_create_liquidation(uuid, uuid) to service_role;

-- Saves the lines the person sent. The filing date stays the one fixed when the liquidation was created.
create function public.telegram_save_liquidation(p_user uuid, p_id uuid, p_department text, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare filed date;
begin
  perform public.telegram_act_as(p_user);
  select filing_date into filed from public.liquidations where id = p_id and owner_id = p_user;
  if not found then raise exception 'Liquidation not found'; end if;
  perform public.save_liquidation(p_id, p_department, filed, p_items, '');
end $$;
revoke execute on function public.telegram_save_liquidation(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.telegram_save_liquidation(uuid, uuid, text, jsonb) to service_role;

create function public.telegram_submit_liquidation(p_user uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.telegram_act_as(p_user);
  if not exists (select 1 from public.liquidations where id = p_id and owner_id = p_user) then
    raise exception 'Liquidation not found';
  end if;
  perform public.submit_liquidation(p_id);
end $$;
revoke execute on function public.telegram_submit_liquidation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.telegram_submit_liquidation(uuid, uuid) to service_role;
