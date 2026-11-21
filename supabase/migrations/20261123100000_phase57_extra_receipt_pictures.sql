-- Phase 57: more than one picture per particular.
--
-- A receipt can be long, have two sides, or come as several photos. A line keeps its main picture exactly as before
-- (liquidation_items.receipt_path: every check, the custodian review and the receipt reading keep working on it) and
-- can now carry up to 5 more pictures, kept here. They belong to the liquidation and follow its visibility; only the
-- person who may edit the draft changes them, through the one function below. The line is matched by its id (no
-- foreign key to the line itself, because saving a draft replaces the line rows).

create table public.liquidation_item_photos (
  liquidation_id uuid not null references public.liquidations(id) on delete cascade,
  item_id uuid not null,
  position int not null check (position between 1 and 5),
  path text not null check (char_length(path) between 1 and 300),
  created_at timestamptz not null default now(),
  primary key (liquidation_id, item_id, position),
  unique (liquidation_id, path)
);
alter table public.liquidation_item_photos enable row level security;
revoke all on public.liquidation_item_photos from anon, authenticated;
grant select on public.liquidation_item_photos to authenticated;
grant all on public.liquidation_item_photos to service_role;
-- whoever can see the liquidation can see its pictures
create policy liquidation_item_photos_read on public.liquidation_item_photos for select to authenticated
  using (exists (select 1 from public.liquidations l where l.id = liquidation_id));

-- Replaces the extra pictures of a draft: [{"item_id": "<line id>", "path": "<storage path>"}, ...] in order.
create function public.set_liquidation_photos(p_id uuid, p_photos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb; item uuid; pic text; n int;
begin
  if not public.can_edit_liquidation(p_id) then
    raise exception 'The pictures of this liquidation can no longer be changed';
  end if;
  p_photos := coalesce(p_photos, '[]'::jsonb);
  if jsonb_typeof(p_photos) <> 'array' then raise exception 'Pictures must be a list'; end if;
  if jsonb_array_length(p_photos) > 100 then raise exception 'Too many pictures'; end if;
  delete from public.liquidation_item_photos where liquidation_id = p_id;
  for x in select value from jsonb_array_elements(p_photos) loop
    item := (x->>'item_id')::uuid;
    pic := btrim(coalesce(x->>'path', ''));
    if not exists (select 1 from public.liquidation_items i where i.liquidation_id = p_id and i.id = item) then
      raise exception 'A picture belongs to a line that is not in this liquidation';
    end if;
    -- the same rule as the main picture: it sits in this liquidation's folder for this line and was really uploaded
    if pic = '' or char_length(pic) > 300 or pic not like p_id::text || '/' || item::text || '/%'
       or not exists (select 1 from storage.objects where bucket_id = 'liquidation-receipts' and name = pic) then
      raise exception 'A picture does not belong to this liquidation line';
    end if;
    select count(*) + 1 into n from public.liquidation_item_photos where liquidation_id = p_id and item_id = item;
    if n > 5 then raise exception 'Add at most 5 more pictures to one line'; end if;
    insert into public.liquidation_item_photos(liquidation_id, item_id, position, path) values (p_id, item, n, pic);
  end loop;
end $$;
revoke execute on function public.set_liquidation_photos(uuid, jsonb) from public, anon;
grant execute on function public.set_liquidation_photos(uuid, jsonb) to authenticated, service_role;
