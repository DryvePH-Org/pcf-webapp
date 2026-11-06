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
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select pg_temp.check_true((select count(*) = 1 from public.list_request_funds() where id='90000000-0000-4000-8000-000000000010'), 'requester fund discovery');
select pg_temp.check_true((select count(*) = 0 from public.funds), 'discovery must not expose financial tables');
select pg_temp.check_true(not public.can_access_fund('90000000-0000-4000-8000-000000000010'), 'requester cannot access fund ledger');
select pg_temp.expect_error($q$select public.create_budget_request('90000000-0000-4000-8000-000000000011','Test Requester',100,'Unassigned')$q$, 'active fund');
select pg_temp.expect_error($q$select public.create_budget_request('90000000-0000-4000-8000-000000000010','Test Requester',1.001,'Precision')$q$, 'two decimals');
select set_config('test.request_id',public.create_budget_request('90000000-0000-4000-8000-000000000010','Test Requester',3000,'Purchase supplies')::text,true);
select pg_temp.check_true((select count(*)=1 from public.budget_requests), 'requester sees own request');
select pg_temp.expect_error($q$update public.budget_requests set status='approved'$q$, 'permission denied');
select pg_temp.expect_error(format('select public.review_budget_request(%L,true)',current_setting('test.request_id')), 'not allowed|permission|role|not authorized');
select pg_temp.check_true((select count(*)=0 from public.vouchers), 'no vouchers visible to requester');

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true((select count(*)=0 from public.budget_requests), 'unassigned custodian cannot read request');
select pg_temp.expect_error(format('select public.review_budget_request(%L,true)',current_setting('test.request_id')), 'not a custodian');
select pg_temp.expect_error(format('select * from public.request_voucher_summary(%L)',current_setting('test.request_id')), 'not found');

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true((select count(*)=1 from public.budget_requests), 'assigned custodian sees queue');
select pg_temp.expect_error(format('select public.review_budget_request(%L,false)',current_setting('test.request_id')), 'reason');
select public.review_budget_request(current_setting('test.request_id')::uuid,true);
select pg_temp.check_true((select expected_cash=10000 from public.fund_balance_v where fund_id='90000000-0000-4000-8000-000000000010'), 'approval does not move cash');
select pg_temp.expect_error(format('select public.review_budget_request(%L,true)',current_setting('test.request_id')), 'submitted');
select pg_temp.expect_error(format($q$select public.create_voucher_from_request(%L,'[{"particulars":"Supplies","amount":3001,"category_id":"90000000-0000-4000-8000-000000000020"}]'::jsonb,current_date,'Receipt after purchase')$q$,current_setting('test.request_id')), 'exceeds the approved budget');
select pg_temp.check_true((select count(*)=0 from public.vouchers), 'failed conversion rolls back voucher');
select set_config('test.voucher_id', public.create_voucher_from_request(current_setting('test.request_id')::uuid,'[{"particulars":"Supplies","amount":3000,"category_id":"90000000-0000-4000-8000-000000000020"}]'::jsonb,current_date,'Receipt after purchase')::text,true);
select pg_temp.check_true((select status='voucher_created' from public.budget_requests where id=current_setting('test.request_id')::uuid), 'conversion status');
select pg_temp.check_true((select expected_cash=10000 from public.fund_balance_v where fund_id='90000000-0000-4000-8000-000000000010'), 'draft does not move cash');
select pg_temp.expect_error(format($q$select public.create_voucher_from_request(%L,'[]'::jsonb)$q$,current_setting('test.request_id')), 'approve');
select pg_temp.expect_error(format('select public.release_voucher(%L)',current_setting('test.voucher_id')), 'approval|approve');
select pg_temp.expect_error(format($q$select public.update_voucher_lines(%L,'Test Requester','[{"particulars":"Supplies","amount":3001,"category_id":"90000000-0000-4000-8000-000000000020"}]'::jsonb)$q$,current_setting('test.voucher_id')), 'approved budget');
select public.submit_voucher(current_setting('test.voucher_id')::uuid);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000005',true);
select pg_temp.check_true((select count(*)=0 from public.budget_requests), 'approver only sees own budget requests');
select public.approve_voucher(current_setting('test.voucher_id')::uuid);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select public.release_voucher(current_setting('test.voucher_id')::uuid);
select pg_temp.check_true((select expected_cash=7000 from public.fund_balance_v where fund_id='90000000-0000-4000-8000-000000000010'), 'cash reduced exactly once on release');

select set_config('test.self_request', public.create_budget_request('90000000-0000-4000-8000-000000000010','Test Custodian',100,'Self test')::text,true);
select pg_temp.expect_error(format('select public.review_budget_request(%L,true)',current_setting('test.self_request')), 'own request');
select public.cancel_budget_request(current_setting('test.self_request')::uuid);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
select pg_temp.check_true((select count(*)=2 from public.budget_requests), 'accounting sees all requests');
select pg_temp.expect_error(format('select public.review_budget_request(%L,true)',current_setting('test.self_request')), 'not allowed|role|permission|not authorized');
select pg_temp.check_true((select count(*)>0 from public.audit_log where entity_type='budget_requests'), 'request changes audited');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select pg_temp.check_true((select released_at is not null from public.request_voucher_summary(current_setting('test.request_id')::uuid)), 'requester sees linked voucher release');
select pg_temp.check_true((select count(*)=1 from public.budget_requests), 'requester cannot see others requests');
select pg_temp.expect_error(format('select public.cancel_budget_request(%L)',current_setting('test.request_id')), 'no longer');
select pg_temp.expect_error(format('select public.cancel_budget_request(%L)',current_setting('test.self_request')), 'only the requester');
reset role;
select pg_temp.check_true(not has_function_privilege('anon','public.create_budget_request(uuid,text,numeric,text)','execute'), 'anonymous RPC denied');
select 'PASS: request permissions, review, linkage, budget ceiling, approval boundary, release balances, audit, cancellation' as result;
rollback;
