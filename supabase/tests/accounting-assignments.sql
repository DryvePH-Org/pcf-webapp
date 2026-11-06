-- Run against a migrated database in a transaction that ALWAYS rolls back.
-- Fixture UUIDs and all financial/profile records disappear on rollback.
begin;
create function pg_temp.check_true(p_ok boolean, p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'TEST FAILED: %', p_message; end if; end $$;
create function pg_temp.expect_error(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then return; end if;
    raise exception 'Unexpected error: % (expected %)', sqlerrm, p_pattern;
  end;
  raise exception 'TEST FAILED: expected error matching %', p_pattern;
end $$;

insert into auth.users(id, email) values
('90000000-0000-4000-8000-000000000001','budget-requester@test.invalid'),
('90000000-0000-4000-8000-000000000002','budget-custodian@test.invalid'),
('90000000-0000-4000-8000-000000000003','budget-other@test.invalid'),
('90000000-0000-4000-8000-000000000004','budget-accounting@test.invalid'),
('90000000-0000-4000-8000-000000000005','budget-approver@test.invalid');
insert into public.profiles(id,full_name,role) values
('90000000-0000-4000-8000-000000000001','Test Requester','requester'),
('90000000-0000-4000-8000-000000000002','Test Custodian','custodian'),
('90000000-0000-4000-8000-000000000003','Other Custodian','custodian'),
('90000000-0000-4000-8000-000000000004','Test Accounting','accounting'),
('90000000-0000-4000-8000-000000000005','Test Approver','approver');
insert into public.funds(id,name,amount,per_txn_limit,approval_threshold) values
('90000000-0000-4000-8000-000000000010','Budget test fund',10000,5000,3000),
('90000000-0000-4000-8000-000000000011','Unassigned test fund',10000,5000,3000);
insert into public.fund_custodians(fund_id,custodian_id) values
('90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000002');
insert into public.categories(id,name) values ('90000000-0000-4000-8000-000000000020','Budget test category');

set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
select public.set_fund_custodians('90000000-0000-4000-8000-000000000010',array['90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003']::uuid[]);
select pg_temp.check_true((select count(*)=2 from public.fund_custodians where fund_id='90000000-0000-4000-8000-000000000010'),'accounting can assign multiple custodians');
select pg_temp.check_true((select count(*)>0 from public.audit_log where entity_type='funds' and entity_id='90000000-0000-4000-8000-000000000010'),'assignments audited');
with changed as(update public.funds set amount=5 where id='90000000-0000-4000-8000-000000000010' returning id) select pg_temp.check_true((select count(*)=0 from changed),'accounting cannot change fund amounts');
select pg_temp.check_true(not has_function_privilege('authenticated','public.record_cash_count(uuid,numeric,text)','execute'),'cash count RPC retired');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select public.set_fund_custodians('90000000-0000-4000-8000-000000000010','{}'::uuid[])$q$,'authorized');
select 'PASS: accounting assignment, audited changes, financial permissions and retired cash-count RPC' as result;
rollback;