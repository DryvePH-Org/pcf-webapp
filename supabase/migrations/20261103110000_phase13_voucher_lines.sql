-- Phase 13: one voucher, many lines (particulars + amount + category each).
-- vouchers.amount stays the total, vouchers.particulars a one-line summary and
-- vouchers.category_id the category of the largest line, so balances, approvals
-- and replenishments keep working unchanged. voucher_items holds the detail.

create table public.voucher_items (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  position int not null check (position > 0),
  particulars text not null check (btrim(particulars) <> ''),
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid not null references public.categories(id),
  unique (voucher_id, position)
);

create index voucher_items_category_idx on public.voucher_items (category_id);

alter table public.voucher_items enable row level security;
create policy voucher_items_select on public.voucher_items
  for select to authenticated using (true);

revoke all on public.voucher_items from anon, authenticated;
grant select on public.voucher_items to authenticated;

-- Existing vouchers become single-line vouchers.
insert into public.voucher_items (voucher_id, position, particulars, amount, category_id)
select id, 1, particulars, amount, category_id from public.vouchers;

-- Lines are written only by the RPC; keep the summary columns in step with them.
revoke update (particulars, amount, category_id) on public.vouchers from authenticated;

create or replace function public.create_voucher_lines(
  p_fund_id uuid,
  p_payee text,
  p_items jsonb,
  p_voucher_date date default current_date,
  p_receipt_path text default null,
  p_no_receipt_reason text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_fund public.funds%rowtype;
  v_id uuid;
  v_item jsonb;
  v_pos int := 0;
  v_total numeric(12,2) := 0;
  v_amount numeric(12,2);
  v_text text;
  v_summary text;
  v_top_category uuid;
  v_top_amount numeric(12,2) := 0;
  v_category uuid;
begin
  perform public.require_role(array['custodian', 'admin']::public.user_role[]);
  perform public.require_fund_access(p_fund_id);

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

  select * into v_fund from public.funds where id = p_fund_id and is_active;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;

  -- First pass: validate every line and total them.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_text := nullif(btrim(coalesce(v_item->>'particulars', '')), '');
    if v_text is null then
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

  select string_agg(btrim(e->>'particulars'), '; ' order by ord)
    into v_summary
    from jsonb_array_elements(p_items) with ordinality as t(e, ord);
  v_summary := left(v_summary, 500);

  select (e->>'category_id')::uuid into v_top_category
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    order by round((e->>'amount')::numeric, 2) desc, ord
    limit 1;

  insert into public.vouchers (
    fund_id, pcv_number, voucher_date, payee, particulars, amount, category_id,
    status, receipt_path, no_receipt_reason, prepared_by
  ) values (
    p_fund_id,
    public.next_pcv_number(p_fund_id),
    coalesce(p_voucher_date, current_date),
    btrim(p_payee),
    v_summary,
    v_total,
    v_top_category,
    'draft',
    nullif(btrim(coalesce(p_receipt_path, '')), ''),
    nullif(btrim(coalesce(p_no_receipt_reason, '')), ''),
    auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    insert into public.voucher_items (voucher_id, position, particulars, amount, category_id)
    values (
      v_id, v_pos, btrim(v_item->>'particulars'),
      round((v_item->>'amount')::numeric, 2), (v_item->>'category_id')::uuid
    );
  end loop;

  return v_id;
end $$;

revoke execute on function public.create_voucher_lines(uuid, text, jsonb, date, text, text)
  from public, anon;
grant execute on function public.create_voucher_lines(uuid, text, jsonb, date, text, text)
  to authenticated, service_role;

-- The single-line RPC stays (tests, scripts) and now delegates.
create or replace function public.create_voucher(
  p_fund_id uuid,
  p_payee text,
  p_particulars text,
  p_amount numeric,
  p_category_id uuid,
  p_voucher_date date default current_date,
  p_receipt_path text default null,
  p_no_receipt_reason text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(coalesce(p_particulars, '')), '') is null then
    raise exception 'Particulars are required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  return public.create_voucher_lines(
    p_fund_id, p_payee,
    jsonb_build_array(jsonb_build_object(
      'particulars', p_particulars, 'amount', p_amount, 'category_id', p_category_id)),
    p_voucher_date, p_receipt_path, p_no_receipt_reason
  );
end $$;
