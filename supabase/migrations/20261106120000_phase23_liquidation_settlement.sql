-- Liquidation approvals document expenditure; only actual cash settlement moves cash.
create table public.liquidations (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null unique references public.vouchers(id),
  fund_id uuid not null references public.funds(id),
  owner_id uuid not null references public.profiles(id),
  pcv_number text not null, fund_name text not null,
  employee_name text not null,
  department text not null default '' check (char_length(department)<=100 and department !~ '[\x01-\x1f\x7f<>]'),
  filing_date date not null default ((now() at time zone 'Asia/Manila')::date),
  amount_received numeric(12,2) not null check(amount_received>0),
  total_spent numeric(12,2) not null default 0 check(total_spent>=0),
  unspent_reason text check(char_length(unspent_reason)<=300 and unspent_reason !~ '[\x01-\x1f\x7f<>]'),
  status text not null default 'draft' check(status in ('draft','submitted','flagged','approved')),
  revision int not null default 0,
  reviewed_by uuid references public.profiles(id),
  reviewer_name text, reviewed_at timestamptz,
  review_note text check(char_length(review_note)<=300 and review_note !~ '[\x01-\x1f\x7f<>]'),
  reimbursement_approved_by uuid references public.profiles(id),
  reimbursement_approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.liquidation_items (
  id uuid primary key default gen_random_uuid(),
  liquidation_id uuid not null references public.liquidations(id),
  position int not null check(position between 1 and 20),
  particulars text not null check(char_length(btrim(particulars)) between 1 and 300 and particulars !~ '[\x01-\x1f\x7f<>]'),
  amount numeric(12,2) not null check(amount>0),
  category_id uuid not null references public.categories(id),
  receipt_path text check(char_length(receipt_path)<=300),
  no_receipt_reason text check(char_length(no_receipt_reason)<=300 and no_receipt_reason !~ '[\x01-\x1f\x7f<>]'),
  unique(liquidation_id,position)
);
create table public.liquidation_revisions (
  id uuid primary key default gen_random_uuid(),
  liquidation_id uuid not null references public.liquidations(id),
  revision int not null, payload jsonb not null,
  status text not null default 'submitted' check(status in ('submitted','flagged','approved')),
  review_note text, reviewer_name text, reviewed_at timestamptz,
  created_at timestamptz not null default now(), unique(liquidation_id,revision)
);
create table public.cash_settlements (
  id uuid primary key default gen_random_uuid(),
  liquidation_id uuid not null unique references public.liquidations(id),
  voucher_id uuid not null unique references public.vouchers(id),
  fund_id uuid not null references public.funds(id),
  kind text not null check(kind in ('return','reimbursement')),
  amount numeric(12,2) not null check(amount>0),
  recorded_by uuid not null references public.profiles(id),
  recorder_name text not null,
  note text check(char_length(note)<=300 and note !~ '[\x01-\x1f\x7f<>]'),
  created_at timestamptz not null default now()
);
create index liquidations_fund_status_idx on public.liquidations(fund_id,status);
create index liquidations_owner_idx on public.liquidations(owner_id,created_at desc);

create function public.can_read_liquidation(p_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.app_role() is not null and exists(select 1 from public.liquidations l where l.id=p_id
    and (l.owner_id=auth.uid() or public.can_access_fund(l.fund_id)));
$$;
create function public.can_edit_liquidation(p_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.app_role() is not null and exists(select 1 from public.liquidations l
    join public.vouchers v on v.id=l.voucher_id where l.id=p_id and l.owner_id=auth.uid()
    and l.status in ('draft','flagged') and v.status not in ('void','closed') and v.replenishment_id is null);
$$;

do $$ declare t text; begin
  foreach t in array array['liquidations','liquidation_items','liquidation_revisions','cash_settlements'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_audit()',t||'_audit',t);
  end loop;
end $$;
create policy liquidations_read on public.liquidations for select to authenticated using(public.can_read_liquidation(id));
create policy liquidation_items_read on public.liquidation_items for select to authenticated using(public.can_read_liquidation(liquidation_id));
create policy liquidation_revisions_read on public.liquidation_revisions for select to authenticated using(public.can_read_liquidation(liquidation_id));
create policy cash_settlements_read on public.cash_settlements for select to authenticated using(public.can_read_liquidation(liquidation_id));
create trigger liquidations_updated before update on public.liquidations for each row execute function public.set_updated_at();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('liquidation-receipts','liquidation-receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy liquidation_receipts_read on storage.objects for select to authenticated using (
  bucket_id='liquidation-receipts' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  then public.can_read_liquidation(((storage.foldername(name))[1])::uuid) else false end
);
create policy liquidation_receipts_insert on storage.objects for insert to authenticated with check (
  bucket_id='liquidation-receipts' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  then public.can_edit_liquidation(((storage.foldername(name))[1])::uuid) else false end
);

create function public.liquidation_context(p_voucher_id uuid)
returns table(voucher_id uuid,fund_id uuid,fund_name text,pcv_number text,amount_received numeric,employee_name text,
  owner_id uuid,prepared_by uuid,released_at timestamptz,voucher_status public.voucher_status,liquidation_id uuid,approval_threshold numeric,per_txn_limit numeric)
language plpgsql stable security definer set search_path=public as $$
begin
  if public.app_role() is null then raise exception 'Sign in first'; end if;
  return query select v.id,v.fund_id,f.name,v.pcv_number,v.amount,coalesce(r.requester_name,v.payee),
    coalesce(r.requester_id,v.prepared_by),v.prepared_by,v.released_at,v.status,l.id,f.approval_threshold,f.per_txn_limit
    from public.vouchers v join public.funds f on f.id=v.fund_id
    left join public.budget_requests r on r.id=v.budget_request_id
    left join public.liquidations l on l.voucher_id=v.id
    where v.id=p_voucher_id and (coalesce(r.requester_id,v.prepared_by)=auth.uid() or public.can_access_fund(v.fund_id));
end $$;

create function public.create_liquidation(p_voucher_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare v public.vouchers%rowtype; c record; lid uuid;
begin
  if public.app_role() is null then raise exception 'Sign in first'; end if;
  select * into v from public.vouchers where id=p_voucher_id for update;
  select * into c from public.liquidation_context(p_voucher_id);
  if not found or c.owner_id<>auth.uid() then raise exception 'Only the employee who received the advance can file liquidation'; end if;
  if c.liquidation_id is not null then return c.liquidation_id; end if;
  if v.released_at is null or v.status in ('void','closed') or v.replenishment_id is not null then raise exception 'Liquidation requires an open voucher with cash released'; end if;
  insert into public.liquidations(voucher_id,fund_id,owner_id,employee_name,amount_received,pcv_number,fund_name)
    values(v.id,v.fund_id,c.owner_id,c.employee_name,v.amount,c.pcv_number,c.fund_name) returning id into lid;
  insert into public.liquidation_items(liquidation_id,position,particulars,amount,category_id)
    select lid,position,particulars,amount,category_id from public.voucher_items where voucher_id=v.id;
  if not found then insert into public.liquidation_items(liquidation_id,position,particulars,amount,category_id)
    values(lid,1,v.particulars,v.amount,v.category_id); end if;
  update public.liquidations set total_spent=(select coalesce(sum(amount),0) from public.liquidation_items where liquidation_id=lid) where id=lid;
  return lid;
end $$;

create function public.save_liquidation(p_id uuid,p_department text,p_filing_date date,p_items jsonb,p_unspent_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare l public.liquidations%rowtype; x jsonb; n int:=0; total numeric:=0; a numeric; iid uuid; cid uuid; path text; reason text;
begin
  perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p_id) for update;
  select * into l from public.liquidations where id=p_id for update;
  if not found or not public.can_edit_liquidation(p_id) then raise exception 'Only the owner can edit a draft or flagged liquidation'; end if;
  if nullif(btrim(p_department),'') is null or p_filing_date is null then raise exception 'Department and filing date are required'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>20 then raise exception 'Use at most 20 expense lines'; end if;
  delete from public.liquidation_items where liquidation_id=p_id;
  for x in select * from jsonb_array_elements(p_items) loop
    n:=n+1; a:=(x->>'amount')::numeric; iid:=(x->>'id')::uuid; cid:=(x->>'category_id')::uuid;
    if a is null or a<=0 or a<>round(a,2) or a>9999999999.99 then raise exception 'Every line needs a positive amount with at most two decimals'; end if;
    if not exists(select 1 from public.categories where id=cid and is_active) then raise exception 'Choose an active category'; end if;
    path:=nullif(btrim(x->>'receipt_path'),''); reason:=nullif(btrim(x->>'no_receipt_reason'),'');
    if path is not null and (path not like p_id::text||'/'||iid::text||'/%'
      or not exists(select 1 from storage.objects where bucket_id='liquidation-receipts' and name=path)) then raise exception 'Receipt does not belong to this liquidation line'; end if;
    insert into public.liquidation_items(id,liquidation_id,position,particulars,amount,category_id,receipt_path,no_receipt_reason)
      values(iid,p_id,n,btrim(x->>'particulars'),a,cid,path,case when path is null then reason else null end);
    total:=total+a;
  end loop;
  if total>9999999999.99 then raise exception 'Total amount is too large'; end if;
  update public.liquidations set department=btrim(p_department),filing_date=p_filing_date,total_spent=total,
    unspent_reason=nullif(btrim(p_unspent_reason),''),status='draft' where id=p_id;
end $$;

create function public.submit_liquidation(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare l public.liquidations%rowtype; items jsonb;
begin
  perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p_id) for update;
  select * into l from public.liquidations where id=p_id for update;
  if not found or not public.can_edit_liquidation(p_id) then raise exception 'Only the owner can submit a draft or flagged liquidation'; end if;
  if (select coalesce(sum(amount),0) from public.liquidation_items where liquidation_id=p_id)<>l.total_spent then raise exception 'Save the form to refresh its expense total'; end if;
  if btrim(l.department)='' then raise exception 'Department is required'; end if;
  if exists(select 1 from public.liquidation_items where liquidation_id=p_id and receipt_path is null and nullif(btrim(no_receipt_reason),'') is null)
    then raise exception 'Attach a receipt or explain why it is missing on every line'; end if;
  if l.total_spent=0 and nullif(btrim(l.unspent_reason),'') is null then raise exception 'Explain why the advance was not spent'; end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by position),'[]'::jsonb) into items from public.liquidation_items i where liquidation_id=p_id;
  insert into public.liquidation_revisions(liquidation_id,revision,payload)
    values(p_id,l.revision+1,jsonb_build_object('form',to_jsonb(l),'items',items));
  update public.liquidations set status='submitted',revision=revision+1,reviewed_by=null,reviewer_name=null,reviewed_at=null,review_note=null where id=p_id;
end $$;

create function public.review_liquidation(p_id uuid,p_approve boolean,p_note text default null) returns void
language plpgsql security definer set search_path=public as $$
declare l public.liquidations%rowtype; reviewer text;
begin
  perform public.require_role(array['custodian','admin']::public.user_role[]);
  perform 1 from public.vouchers where id=(select voucher_id from public.liquidations where id=p_id) for update;
  select * into l from public.liquidations where id=p_id for update;
  if not found or l.status<>'submitted' then raise exception 'Only submitted liquidations can be reviewed'; end if;
  perform public.require_fund_access(l.fund_id);
  if l.owner_id=auth.uid() then raise exception 'You cannot review your own liquidation'; end if;
  if p_approve is null or (not p_approve and nullif(btrim(p_note),'') is null) then raise exception 'A flag reason is required'; end if;
  if p_approve and exists(select 1 from public.liquidation_items i where i.liquidation_id=p_id and i.receipt_path is not null and not exists(select 1 from storage.objects o where o.bucket_id='liquidation-receipts' and o.name=i.receipt_path)) then raise exception 'A receipt attachment is missing; flag for correction'; end if;
  select full_name into reviewer from public.profiles where id=auth.uid();
  update public.liquidations set status=case when p_approve then 'approved' else 'flagged' end,
    reviewed_by=auth.uid(),reviewer_name=reviewer,reviewed_at=now(),review_note=nullif(btrim(p_note),'') where id=p_id;
  update public.liquidation_revisions set status=case when p_approve then 'approved' else 'flagged' end,
    reviewer_name=reviewer,reviewed_at=now(),review_note=nullif(btrim(p_note),'') where liquidation_id=p_id and revision=l.revision;
end $$;

create function public.approve_liquidation_reimbursement(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare l public.liquidations%rowtype; v public.vouchers%rowtype;
begin
  perform public.require_role(array['approver','admin']::public.user_role[]);
  select * into v from public.vouchers where id=(select voucher_id from public.liquidations where id=p_id) for update;
  select * into l from public.liquidations where id=p_id for update;
  if not found or l.status<>'approved' or l.total_spent<=l.amount_received then raise exception 'An approved liquidation with reimbursement due is required'; end if;
  if auth.uid() in (l.owner_id,l.reviewed_by,v.prepared_by) then raise exception 'An independent approver must approve this reimbursement'; end if;
  if l.reimbursement_approved_by is not null then raise exception 'Reimbursement is already approved'; end if;
  update public.liquidations set reimbursement_approved_by=auth.uid(),reimbursement_approved_at=now() where id=p_id;
end $$;

-- Net unreplenished cash includes only settlement actually received/paid.
create or replace view public.fund_balance_v with(security_invoker=true) as
select f.id as fund_id,f.name,f.amount as fund_amount,
  coalesce(sum(v.amount-case when s.kind='return' then s.amount when s.kind='reimbursement' then -s.amount else 0 end),0)::numeric(12,2) as released_vouchers_total,
  (f.amount-coalesce(sum(v.amount-case when s.kind='return' then s.amount when s.kind='reimbursement' then -s.amount else 0 end),0))::numeric(12,2) as expected_cash,
  (f.amount-coalesce(sum(v.amount-case when s.kind='return' then s.amount when s.kind='reimbursement' then -s.amount else 0 end),0))<f.amount*f.low_balance_pct/100.0 as is_low,
  coalesce(sum(v.amount) filter(where l.status is distinct from 'approved'),0)::numeric(12,2) as advances_pending_liquidation,
  coalesce(sum(greatest(l.amount_received-l.total_spent,0)) filter(where l.status='approved' and s.id is null),0)::numeric(12,2) as returns_due,
  coalesce(sum(greatest(l.total_spent-l.amount_received,0)) filter(where l.status='approved' and s.id is null),0)::numeric(12,2) as reimbursements_due
from public.funds f left join public.vouchers v on v.fund_id=f.id and v.released_at is not null and v.status in ('released','approved','rejected')
left join public.liquidations l on l.voucher_id=v.id left join public.cash_settlements s on s.voucher_id=v.id
group by f.id,f.name,f.amount;

create function public.record_liquidation_settlement(p_id uuid,p_amount numeric,p_note text default null) returns void
language plpgsql security definer set search_path=public as $$
declare l public.liquidations%rowtype; v public.vouchers%rowtype; f public.funds%rowtype; diff numeric; cash numeric; recorder text;
begin
  perform public.require_role(array['custodian','admin']::public.user_role[]);
  select * into f from public.funds where id=(select fund_id from public.liquidations where id=p_id) for update;
  select * into v from public.vouchers where id=(select voucher_id from public.liquidations where id=p_id) for update;
  select * into l from public.liquidations where id=p_id for update;
  if not found or l.status<>'approved' then raise exception 'Approve liquidation before recording settlement'; end if;
  perform public.require_fund_access(l.fund_id);
  if l.owner_id=auth.uid() then raise exception 'Another custodian must record your settlement'; end if;
  if v.replenishment_id is not null or v.status in ('void','closed') then raise exception 'This voucher cannot take a settlement'; end if;
  if exists(select 1 from public.cash_settlements where liquidation_id=p_id) then raise exception 'Settlement has already been recorded'; end if;
  diff:=l.amount_received-l.total_spent;
  if diff=0 then raise exception 'No cash adjustment is needed'; end if;
  if p_amount is null or p_amount<>abs(diff) then raise exception 'Record the exact return or reimbursement due'; end if;
  if diff<0 then
    if v.status='rejected' then raise exception 'Resolve the voucher flag before paying reimbursement'; end if;
    if not f.is_active then raise exception 'This fund is inactive'; end if;
    if l.total_spent>f.per_txn_limit then raise exception 'Actual spending exceeds the fund transaction limit'; end if;
    if l.total_spent>=f.approval_threshold and l.reimbursement_approved_by is null then raise exception 'Independent approver approval is required before reimbursement'; end if;
    select expected_cash into cash from public.fund_balance_v where fund_id=f.id;
    if cash < -diff then raise exception 'Insufficient cash for reimbursement'; end if;
  end if;
  select full_name into recorder from public.profiles where id=auth.uid();
  insert into public.cash_settlements(liquidation_id,voucher_id,fund_id,kind,amount,recorded_by,recorder_name,note)
    values(l.id,v.id,l.fund_id,case when diff>0 then 'return' else 'reimbursement' end,abs(diff),auth.uid(),recorder,nullif(btrim(p_note),''));
  -- A fully unused advance is resolved by its actual cash return, without a zero-value replenishment.
  if l.total_spent=0 then update public.vouchers set status='closed' where id=v.id; end if;
end $$;

create function public.guard_liquidated_voucher() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.status='void' and old.status is distinct from 'void' and old.released_at is not null then raise exception 'Released cash cannot be voided; settle it through liquidation'; end if;
  if exists(select 1 from public.liquidations where voucher_id=old.id) and
    (new.amount is distinct from old.amount or new.fund_id is distinct from old.fund_id or new.budget_request_id is distinct from old.budget_request_id or new.prepared_by is distinct from old.prepared_by)
    then raise exception 'A liquidated voucher cannot change its advance or owner'; end if;
  return new;
end $$;
create trigger vouchers_liquidation_guard before update on public.vouchers for each row execute function public.guard_liquidated_voucher();

-- Explicit function grants: anonymous users cannot call any new RPC/helper.
do $$ declare fn regprocedure; begin
  for fn in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in (
    'can_read_liquidation','can_edit_liquidation','liquidation_context','create_liquidation','save_liquidation','submit_liquidation',
    'review_liquidation','approve_liquidation_reimbursement','record_liquidation_settlement') loop
    execute format('revoke execute on function %s from public,anon',fn);
    execute format('grant execute on function %s to authenticated,service_role',fn);
  end loop;
end $$;
