-- Phase 15: a custodian can correct the payee, date and lines of their own
-- draft voucher. Submitted and released vouchers stay locked.

create or replace function public.update_voucher_lines(
  p_id uuid,
  p_payee text,
  p_items jsonb,
  p_voucher_date date default current_date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role;
  v_voucher public.vouchers%rowtype;
  v_fund public.funds%rowtype;
  v_item jsonb;
  v_pos int := 0;
  v_total numeric(12,2) := 0;
  v_amount numeric(12,2);
  v_category uuid;
  v_summary text;
  v_top_category uuid;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.user_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'draft' then
    raise exception 'Only drafts can be edited';
  end if;
  if v_voucher.prepared_by <> auth.uid() then
    raise exception 'You can only edit your own vouchers';
  end if;
  perform public.require_fund_access(v_voucher.fund_id);

  if nullif(btrim(coalesce(p_payee, '')), '') is null then
    raise exception 'Payee is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 then
    raise exception 'Add at least one line';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'A voucher can have at most 20 lines';
  end if;

  select * into v_fund from public.funds where id = v_voucher.fund_id and is_active;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if nullif(btrim(coalesce(v_item->>'particulars', '')), '') is null then
      raise exception 'Every line needs particulars';
    end if;
    begin
      v_amount := round((v_item->>'amount')::numeric, 2);
    exception when others then
      raise exception 'Every line needs a valid amount';
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Every line amount must be greater than zero';
    end if;
    begin
      v_category := (v_item->>'category_id')::uuid;
    exception when others then
      raise exception 'Every line needs a category';
    end;
    perform 1 from public.categories where id = v_category and is_active;
    if not found then
      raise exception 'Category not found or inactive';
    end if;
    v_total := v_total + v_amount;
  end loop;

  if v_total > v_fund.per_txn_limit then
    raise exception 'Amount exceeds the per-transaction limit of %', v_fund.per_txn_limit;
  end if;

  select left(string_agg(btrim(e->>'particulars'), '; ' order by ord), 500)
    into v_summary
    from jsonb_array_elements(p_items) with ordinality as t(e, ord);

  select (e->>'category_id')::uuid into v_top_category
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    order by round((e->>'amount')::numeric, 2) desc, ord
    limit 1;

  update public.vouchers
  set payee = btrim(p_payee),
      voucher_date = coalesce(p_voucher_date, voucher_date),
      particulars = v_summary,
      amount = v_total,
      category_id = v_top_category
  where id = p_id;

  delete from public.voucher_items where voucher_id = p_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    insert into public.voucher_items (voucher_id, position, particulars, amount, category_id)
    values (
      p_id, v_pos, btrim(v_item->>'particulars'),
      round((v_item->>'amount')::numeric, 2), (v_item->>'category_id')::uuid
    );
  end loop;
end $$;

revoke execute on function public.update_voucher_lines(uuid, text, jsonb, date)
  from public, anon;
grant execute on function public.update_voucher_lines(uuid, text, jsonb, date)
  to authenticated, service_role;
