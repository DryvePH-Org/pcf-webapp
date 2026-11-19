-- Phase 51: a liquidation draft can be saved before the department is filled in.
-- A draft is for unfinished work, but saving one was refused without a department, so the person could
-- not keep what they had typed. The department is still required to submit (submit_liquidation checks it).
do $$
declare def text; fixed text;
begin
  select pg_get_functiondef('public.save_liquidation_before_sheets(uuid,text,date,jsonb,text)'::regprocedure) into def;
  fixed := replace(def,
    'if nullif(btrim(p_department),'''') is null or p_filing_date is null then raise exception ''Department and filing date are required''; end if;',
    'if p_filing_date is null then raise exception ''Filing date is required''; end if;');
  if fixed = def then raise exception 'Draft department check was not found'; end if;
  -- an empty department is stored as empty text (the column is not null)
  def := fixed;
  fixed := replace(def, 'department=btrim(p_department)', 'department=btrim(coalesce(p_department,''''))');
  if fixed = def then raise exception 'Draft department update was not found'; end if;
  execute fixed;
end $$;
