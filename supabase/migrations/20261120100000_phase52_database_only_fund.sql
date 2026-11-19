-- Phase 52: a fund can keep its ledger in the database only (no Google Sheet, no Grokbot).
--
-- Until now every fund was written to a Google Sheet by a Grokbot, and several steps assumed it: approving a
-- liquidation needed an enabled sheet, the tag list came from the sheet, and a replenishment queued a marker row.
-- A fund now carries an explicit setting, sheet_ledger. It is true for every existing fund, so none of them
-- changes. A new fund set to false:
--   * approves liquidations in the app alone (approve_liquidation_without_sheet),
--   * takes its expense tags from a list kept in the database (fund_expense_tags),
--   * never queues a sheet marker on replenishment, and can never be connected to a sheet by mistake.
-- The setting is explicit (not "has no workbook") so that a sheet fund that loses its workbook still fails
-- loudly instead of silently stopping its sheet writes.
-- Also: refresh jobs that Grokbot never answered are released by themselves.

alter table public.funds add column sheet_ledger boolean not null default true;

-- The way a fund keeps its ledger is fixed once it has vouchers, and a database-only fund cannot hold a workbook.
create function public.guard_fund_ledger_mode() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sheet_ledger is distinct from old.sheet_ledger then
    if exists (select 1 from public.vouchers where fund_id = old.id) then
      raise exception 'A fund that already has vouchers cannot change how its ledger is kept';
    end if;
    if not new.sheet_ledger and exists (select 1 from public.sheet_workbooks where fund_id = old.id and enabled) then
      raise exception 'Disconnect this fund''s Google Sheet before making it database-only';
    end if;
  end if;
  return new;
end $$;
create trigger funds_ledger_mode_guard before update of sheet_ledger on public.funds
  for each row execute function public.guard_fund_ledger_mode();

create function public.guard_workbook_fund() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.enabled and new.fund_id is not null
     and exists (select 1 from public.funds where id = new.fund_id and not sheet_ledger) then
    raise exception 'This fund keeps its ledger in the database only. It cannot be connected to a Google Sheet';
  end if;
  return new;
end $$;
create trigger sheet_workbooks_database_only_guard before insert or update on public.sheet_workbooks
  for each row execute function public.guard_workbook_fund();

-- The expense tags of a database-only fund (the sheet's list does not exist for it).
create table public.fund_expense_tags (
  fund_id uuid not null references public.funds(id) on delete cascade,
  tag text not null check (char_length(btrim(tag)) between 1 and 150 and tag !~ '[\x01-\x1f\x7f<>]'),
  position int not null check (position >= 0),
  primary key (fund_id, tag)
);
alter table public.fund_expense_tags enable row level security;
revoke all on public.fund_expense_tags from anon, authenticated;
grant select on public.fund_expense_tags to authenticated;
grant all on public.fund_expense_tags to service_role;
create policy fund_expense_tags_read on public.fund_expense_tags for select to authenticated
  using (public.app_role() in ('admin', 'accounting', 'custodian'));

create function public.set_fund_expense_tags(p_fund uuid, p_tags text[]) returns void
language plpgsql security definer set search_path = public as $$
declare cleaned text[];
begin
  perform public.require_role(array['admin']::public.user_role[]);
  perform 1 from public.funds where id = p_fund and not sheet_ledger for update;
  if not found then raise exception 'Only a database-only fund keeps its own tag list'; end if;
  select coalesce(array_agg(t order by first_seen), '{}') into cleaned from (
    select btrim(x.tag) as t, min(x.ord) as first_seen
    from unnest(coalesce(p_tags, '{}')) with ordinality as x(tag, ord)
    where btrim(x.tag) <> '' group by btrim(x.tag)) as listed;
  if cardinality(cleaned) > 200 then raise exception 'Use at most 200 tags'; end if;
  delete from public.fund_expense_tags where fund_id = p_fund;
  insert into public.fund_expense_tags(fund_id, tag, position)
  select p_fund, t, ord - 1 from unnest(cleaned) with ordinality as x(t, ord);
end $$;
revoke execute on function public.set_fund_expense_tags(uuid, text[]) from public, anon;
grant execute on function public.set_fund_expense_tags(uuid, text[]) to authenticated, service_role;

-- Approving a liquidation of a database-only fund: the same checks as the sheet approval, with no sheet update.
create function public.approve_liquidation_without_sheet(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l public.liquidations;
begin
  perform public.require_role(array['custodian', 'approver', 'admin']::public.user_role[]);
  select * into l from public.liquidations where id = p_id;
  if not found then raise exception 'Liquidation not found'; end if;
  perform 1 from public.vouchers where id = l.voucher_id for update;
  select * into l from public.liquidations where id = p_id for update;
  if l.status <> 'submitted' then raise exception 'Only a submitted liquidation can be approved'; end if;
  if (select f.sheet_ledger from public.funds f where f.id = l.fund_id) then
    raise exception 'This fund writes to a Google Sheet. Approve it with the sheet update';
  end if;
  if l.flow_version = 2 then
    if l.receipt_reviewed_by is distinct from auth.uid() then
      raise exception 'Complete and save the custodian receipt review first';
    end if;
    if (select coalesce(sum(amount), 0) from public.liquidation_receipt_lines where liquidation_id = l.id) <> l.total_spent then
      raise exception 'Receipt total does not match requester expenses';
    end if;
    if exists (select 1 from public.liquidation_receipt_lines r where r.liquidation_id = l.id and r.receipt_path is not null
               and not exists (select 1 from storage.objects where bucket_id = 'liquidation-receipts' and name = r.receipt_path)) then
      raise exception 'A reviewed receipt image is missing';
    end if;
  end if;
  -- the approval itself: who may approve, self-approval where the fund allows it and its audit
  perform public.review_liquidation_before_sheets(p_id, true, null);
end $$;
revoke execute on function public.approve_liquidation_without_sheet(uuid) from public, anon;
grant execute on function public.approve_liquidation_without_sheet(uuid) to authenticated, service_role;

do $$
declare def text; fixed text;
begin
  -- The tag list of a database-only fund comes from fund_expense_tags.
  select pg_get_functiondef('public.list_custodian_tags(uuid)'::regprocedure) into def;
  fixed := replace(def, 'perform public.require_fund_access(p_fund);',
    E'perform public.require_fund_access(p_fund);\n if exists (select 1 from public.funds f where f.id = p_fund and not f.sheet_ledger) then\n  return coalesce((select array_agg(t.tag order by t.position) from public.fund_expense_tags t where t.fund_id = p_fund), ''{}'');\n end if;');
  if fixed = def then raise exception 'Tag list fund check was not found'; end if;
  execute fixed;

  -- A replenishment of a database-only fund has no sheet marker.
  select pg_get_functiondef('public.enqueue_sheet_rollover()'::regprocedure) into def;
  fixed := replace(def, 'if new.status=''approved'' and old.status<>''approved'' then',
    'if new.status=''approved'' and old.status<>''approved'' and (select f.sheet_ledger from public.funds f where f.id=new.fund_id) then');
  if fixed = def then raise exception 'Rollover trigger condition was not found'; end if;
  execute fixed;
end $$;

-- Approvers are told in the app by the sweep itself; the email is sent by the app. The sweep records each
-- request it sent back here, and the app emails the approvers and marks it done.
create table public.request_approval_emails (
  request_id uuid primary key references public.budget_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);
alter table public.request_approval_emails enable row level security;
revoke all on public.request_approval_emails from anon, authenticated;
grant all on public.request_approval_emails to service_role;

do $$
declare def text; fixed text;
begin
  select pg_get_functiondef('public.resync_request_approvals(uuid)'::regprocedure) into def;
  fixed := replace(def, 'n := n + 1;',
    E'n := n + 1;\n    insert into public.request_approval_emails(request_id) values (moved.id)\n    on conflict (request_id) do update set created_at = now(), emailed_at = null;');
  if fixed = def then raise exception 'Sweep counter was not found'; end if;
  execute fixed;
end $$;

-- A refresh that Grokbot never answered must not hold up the next one: running over ten minutes, or queued
-- over ten minutes, is released as failed. Refresh jobs only read the sheet, so releasing one is always safe.
-- (Financial writes are left alone: they have their own review and retry.)
create or replace function public.claim_grokbot_dispatch() returns setof public.grokbot_operations
language plpgsql security definer set search_path = public as $$
declare operation uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('grokbot-buying-dispatch',0));
 update grokbot_operations set status = 'failed', error = 'Grokbot did not answer in time. Refresh again.', updated_at = now()
  where kind = 'workbook_refresh' and status = 'running' and updated_at < now() - interval '10 minutes';
 update grokbot_operations set status = 'failed', error = 'A newer refresh replaced this one.', updated_at = now()
  where kind = 'workbook_refresh' and status = 'queued' and created_at < now() - interval '10 minutes';
 select q.id into operation from grokbot_operations q
  where q.status='queued'
    and not exists (select 1 from grokbot_operations r
                    where r.status='running' and r.spreadsheet_id=q.spreadsheet_id and r.sheet_id=q.sheet_id)
  order by q.created_at, q.id limit 1 for update;
 if operation is null then return; end if;
 return query update grokbot_operations set status='running',updated_at=now() where id=operation returning *;
end $$;
