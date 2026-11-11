create or replace function public.create_budget_request(p_fund_id uuid, p_name text, p_amount numeric, p_purpose text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_name text;
begin
  select full_name into p_name from public.profiles where id=auth.uid() and is_active;
  perform public.require_role(array['admin','custodian','approver','accounting','requester']::public.user_role[]);
  select f.name into v_name from public.funds f where f.id = p_fund_id and f.is_active
    and exists (select 1 from public.fund_custodians fc join public.profiles p on p.id = fc.custodian_id
      where fc.fund_id = f.id and p.is_active and p.role = 'custodian');
  if not found then raise exception 'Choose an active fund with an assigned custodian'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 9999999999.99 then
    raise exception 'Enter a valid budget greater than zero with at most two decimals';
  end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_purpose), '') is null then
    raise exception 'Name and purpose are required';
  end if;
  insert into public.budget_requests(id, request_no, requester_id, requester_name, fund_id, fund_name, amount, purpose)
    values (v_id, 'BR-' || upper(v_id::text), auth.uid(), btrim(p_name), p_fund_id, v_name, p_amount, btrim(p_purpose));
  return v_id;
end $$;
