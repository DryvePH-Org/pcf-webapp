-- Phase 62: more than one picture per receipt line, and splitting one receipt into several particulars, in the
-- Telegram liquidation. A line keeps its main picture and can carry up to 5 more, exactly as on the website; a split
-- receipt becomes several lines that share the one picture.

alter table public.telegram_liq_drafts drop constraint telegram_liq_drafts_status_check;
alter table public.telegram_liq_drafts add constraint telegram_liq_drafts_status_check check (status in
  ('choosing', 'draft', 'editing_particulars', 'editing_amount', 'editing_department', 'adding_photo', 'splitting', 'submitted', 'cancelled'));
drop index public.telegram_liq_drafts_one_open;
create unique index telegram_liq_drafts_one_open on public.telegram_liq_drafts(chat_id)
  where status in ('choosing', 'draft', 'editing_particulars', 'editing_amount', 'editing_department', 'adding_photo', 'splitting');

alter table public.telegram_liq_lines
  add column extra_photos text[] not null default '{}' check (cardinality(extra_photos) <= 5),
  -- the order of the parts of a split receipt, which all share the time of the line they came from
  add column part int not null default 0;

-- Saves the extra pictures of the person's draft liquidation, as the person. The same function the website uses, so
-- each picture must sit in this line's own folder and really exist.
create function public.telegram_set_liquidation_photos(p_user uuid, p_id uuid, p_photos jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.telegram_act_as(p_user);
  if not exists (select 1 from public.liquidations where id = p_id and owner_id = p_user) then
    raise exception 'Liquidation not found';
  end if;
  perform public.set_liquidation_photos(p_id, p_photos);
end $$;
revoke execute on function public.telegram_set_liquidation_photos(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.telegram_set_liquidation_photos(uuid, uuid, jsonb) to service_role;
