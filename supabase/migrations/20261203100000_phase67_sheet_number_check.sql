-- Phase 67: the app now notices when the numbers in a sheet and the app disagree.
--
-- Until now a row in the sheet whose voucher number matched no voucher of the app was ignored, which is how a number
-- typed wrongly (16 instead of 0016) or an old-style number stayed unnoticed. On every read of the sheet the app now
-- also lists, for accounting to look at (and cleared by itself once fixed):
--  * a sheet row whose voucher number is not a voucher of that fund, with the number it probably should be;
--  * a voucher Grokbot wrote into the current tab whose number is no longer anywhere in the sheet.

alter table public.sheet_edit_log drop constraint sheet_edit_log_kind_check;
alter table public.sheet_edit_log add constraint sheet_edit_log_kind_check check (kind in
  ('tag_changed', 'tag_unknown', 'amount_differs', 'number_unknown', 'missing_in_sheet'));

create or replace function public.apply_sheet_edits(p_book text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  wb record; s record; a record; m record; known text[]; matched uuid[] := '{}'; sug text; digits int;
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
    -- a number the app never gave to a voucher of this fund: a typo, an old number, or a row typed by hand
    if not exists (select 1 from public.vouchers v where v.fund_id = wb.fund_id and v.pcv_number = btrim(s.voucher)) then
      sug := null;
      select v.pcv_number into sug from public.vouchers v where v.fund_id = wb.fund_id and v.previous_number = btrim(s.voucher) limit 1;
      if sug is not null then
        sug := format(' That is the old number of %s, so the number to use is %s.', sug, sug);
      else
        digits := nullif(substring(btrim(s.voucher) from '[0-9]+$'), '')::int;
        if digits is not null then
          select format(' Did you mean %s?', v.pcv_number) into sug from public.vouchers v
          where v.fund_id = wb.fund_id and substring(v.pcv_number from '[0-9]+$')::int = digits
          order by v.created_at limit 1;
        end if;
      end if;
      insert into public.sheet_edit_log(book_id, fund_id, voucher, kind, summary, app_value, sheet_value, sheet_row, applied)
      values (p_book, wb.fund_id, btrim(s.voucher), 'number_unknown',
              format('Row %s of the sheet has the voucher number "%s", and the app has no voucher with that number in this fund.%s', s.source_row, btrim(s.voucher), coalesce(sug, ' Check the number in the sheet.')),
              '', btrim(s.voucher), s.source_row, false)
      on conflict do nothing;
      n_flagged := n_flagged + 1;
      continue;
    end if;
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
  -- a voucher Grokbot wrote into this tab whose number is no longer anywhere in the sheet
  for m in
    select v.pcv_number from public.liquidations l join public.vouchers v on v.id = l.voucher_id
    where l.status = 'approved' and l.fund_id = wb.fund_id
      and exists (select 1 from public.grokbot_operations o where o.liquidation_id = l.id and o.kind = 'liquidation_approved'
                  and o.status = 'completed' and o.sheet_id = wb.active_sheet_id)
      and not exists (select 1 from jsonb_to_recordset(p_rows) as r(voucher text) where btrim(coalesce(r.voucher, '')) = v.pcv_number)
  loop
    insert into public.sheet_edit_log(book_id, fund_id, voucher, kind, summary, app_value, sheet_value, applied)
    values (p_book, wb.fund_id, m.pcv_number, 'missing_in_sheet',
            format('Voucher %s was written to the sheet, but the sheet has no row with that number now. Check the sheet, then ask for the voucher to be sent again if its rows were deleted or renumbered.', m.pcv_number),
            m.pcv_number, '', false)
    on conflict do nothing;
    n_flagged := n_flagged + 1;
  end loop;
  return jsonb_build_object('applied', n_applied, 'flagged', n_flagged);
end $$;
revoke all on function public.apply_sheet_edits(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_sheet_edits(text, jsonb) to service_role;
