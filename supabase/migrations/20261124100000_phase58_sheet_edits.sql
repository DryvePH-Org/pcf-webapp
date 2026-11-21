-- Phase 58: what accounting changes by hand in a Google Sheet reaches the app.
--
-- Staff correct entries directly in the sheet (a tag moved from NCE - MEALS to NCE - REPRESENTATION, for example).
-- The app keeps its own records, so the two used to drift apart. Each time Grokbot reads the sheet back, the app now
-- compares the sheet's rows with its approved expense lines, matching them by voucher number, amount and particulars:
--  * a different tag in the sheet is copied into the app's line (the change is audited and listed below), as long
--    as it is one of the sheet's own expense tags;
--  * anything else that does not fit (a tag the sheet does not list, an amount that matches no line of that
--    voucher) is listed for accounting to look at, and clears itself once the sheet and the app agree again.
-- Money amounts are never changed from the sheet: they only raise a flag.

create table public.sheet_edit_log (
  id uuid primary key default gen_random_uuid(),
  book_id text not null,
  fund_id uuid references public.funds(id) on delete set null,
  liquidation_id uuid references public.liquidations(id) on delete cascade,
  line_id uuid,
  voucher text not null default '',
  kind text not null check (kind in ('tag_changed', 'tag_unknown', 'amount_differs')),
  summary text not null,
  app_value text not null default '',
  sheet_value text not null default '',
  sheet_row int,
  applied boolean not null default false,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index sheet_edit_log_recent on public.sheet_edit_log(book_id, detected_at desc);
create unique index sheet_edit_log_open_flag on public.sheet_edit_log(book_id, kind, voucher, coalesce(sheet_row, 0), sheet_value)
  where resolved_at is null and not applied;
alter table public.sheet_edit_log enable row level security;
revoke all on public.sheet_edit_log from anon, authenticated;
grant select on public.sheet_edit_log to authenticated;
grant all on public.sheet_edit_log to service_role;
create policy sheet_edit_log_read on public.sheet_edit_log for select to authenticated
  using (public.app_role() in ('admin', 'accounting'));

-- p_rows are the sheet's expense rows as the app parsed them (source_row, voucher, category, particulars, amount).
create function public.apply_sheet_edits(p_book text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  wb record; s record; a record; known text[]; matched uuid[] := '{}';
  n_applied int := 0; n_flagged int := 0; tagname text;
begin
  select id, fund_id, active_sheet_id, catalog into wb from public.sheet_workbooks where id = p_book;
  if not found or wb.fund_id is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('applied', 0, 'flagged', 0);
  end if;
  -- the tags the sheet itself lists (its summary of accounts); empty means any tag is accepted
  select coalesce(array_agg(t), '{}') into known
  from public.sheet_workbooks w, jsonb_array_elements(w.catalog) tab, jsonb_array_elements_text(coalesce(tab->'expenseTags', '[]'::jsonb)) t
  where w.id = p_book and (tab->>'sheetId')::int = w.active_sheet_id;
  -- flags are recomputed on every read: the ones that are still true come back below
  update public.sheet_edit_log set resolved_at = now() where book_id = p_book and resolved_at is null and not applied;

  for s in
    select * from jsonb_to_recordset(p_rows) as r(source_row int, voucher text, category text, particulars text, amount numeric)
    order by source_row
  loop
    if coalesce(btrim(s.voucher), '') = '' or s.amount is null then continue; end if;
    -- the app's line this row describes
    select r.id, r.liquidation_id, r.tag into a
    from public.liquidation_receipt_lines r
    join public.liquidations l on l.id = r.liquidation_id and l.status = 'approved' and l.fund_id = wb.fund_id
    join public.vouchers v on v.id = l.voucher_id
    where case when v.flow_version = 2 then coalesce(nullif(v.paper_pcv_number, ''), v.pcv_number) else v.pcv_number end = btrim(s.voucher)
      and r.amount = s.amount and not (r.id = any(matched))
    order by (lower(btrim(r.particulars)) = lower(btrim(coalesce(s.particulars, '')))) desc, r.position
    limit 1;

    if found then
      matched := matched || a.id;
      tagname := btrim(coalesce(s.category, ''));
      if tagname <> '' and tagname <> a.tag then
        if cardinality(known) > 0 and not (tagname = any(known)) then
          insert into public.sheet_edit_log(book_id, fund_id, liquidation_id, line_id, voucher, kind, summary, app_value, sheet_value, sheet_row, applied)
          values (p_book, wb.fund_id, a.liquidation_id, a.id, btrim(s.voucher), 'tag_unknown',
                  format('Voucher %s, row %s: the sheet says "%s", which is not one of its expense tags. The app keeps "%s".', btrim(s.voucher), s.source_row, tagname, a.tag),
                  a.tag, tagname, s.source_row, false)
          on conflict do nothing;
          n_flagged := n_flagged + 1;
        else
          update public.liquidation_receipt_lines set tag = tagname where id = a.id;
          insert into public.sheet_edit_log(book_id, fund_id, liquidation_id, line_id, voucher, kind, summary, app_value, sheet_value, sheet_row, applied)
          values (p_book, wb.fund_id, a.liquidation_id, a.id, btrim(s.voucher), 'tag_changed',
                  format('Voucher %s, row %s: the tag was changed in the sheet from "%s" to "%s". The app now matches.', btrim(s.voucher), s.source_row, a.tag, tagname),
                  a.tag, tagname, s.source_row, true);
          n_applied := n_applied + 1;
        end if;
      end if;
    elsif exists (
      select 1 from public.liquidations l join public.vouchers v on v.id = l.voucher_id
      where l.status = 'approved' and l.fund_id = wb.fund_id
        and case when v.flow_version = 2 then coalesce(nullif(v.paper_pcv_number, ''), v.pcv_number) else v.pcv_number end = btrim(s.voucher)
        and exists (select 1 from public.liquidation_receipt_lines r where r.liquidation_id = l.id)
    ) then
      -- the voucher is the app's, but no line of it has this amount (or its lines are all matched already)
      insert into public.sheet_edit_log(book_id, fund_id, voucher, kind, summary, app_value, sheet_value, sheet_row, applied)
      values (p_book, wb.fund_id, btrim(s.voucher), 'amount_differs',
              format('Voucher %s, row %s: the sheet shows %s, and the app has no line of that voucher with this amount. Check whether it was edited or typed twice.', btrim(s.voucher), s.source_row, to_char(s.amount, 'FM999,999,990.00')),
              '', s.amount::text, s.source_row, false)
      on conflict do nothing;
      n_flagged := n_flagged + 1;
    end if;
  end loop;
  return jsonb_build_object('applied', n_applied, 'flagged', n_flagged);
end $$;
revoke all on function public.apply_sheet_edits(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_sheet_edits(text, jsonb) to service_role;
