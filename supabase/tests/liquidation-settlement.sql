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



insert into auth.users(id,email) values('90000000-0000-4000-8000-000000000006','liquidation-admin@test.invalid');
insert into public.profiles(id,full_name,role) values('90000000-0000-4000-8000-000000000006','Test Admin','admin');
create function pg_temp.cash() returns numeric language sql security definer as $$
 select expected_cash from public.fund_balance_v where fund_id='90000000-0000-4000-8000-000000000010'; $$;
create function pg_temp.make_advance() returns uuid language plpgsql as $$
declare rid uuid; vid uuid; lid uuid;
begin
 perform set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
 rid:=public.create_budget_request('90000000-0000-4000-8000-000000000010','Test Requester',2000,'Liquidation test');
 perform set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
 perform public.review_budget_request(rid,true);
 vid:=public.create_voucher_from_request(rid,'[{"particulars":"Supplies","amount":2000,"category_id":"90000000-0000-4000-8000-000000000020"}]',current_date,'Receipt after purchase');
 perform public.release_voucher(vid);
 perform set_config('test.voucher_id',vid::text,true);
 perform set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
 lid:=public.create_liquidation(vid);
 return lid;
end $$;
create function pg_temp.expenses(lid uuid, spent numeric, reason text default 'Vendor did not issue receipt') returns void language plpgsql as $$
declare items jsonb;
begin
 items:=case when spent=0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'particulars','Actual supplies','amount',spent,'category_id','90000000-0000-4000-8000-000000000020','no_receipt_reason',reason)) end;
 perform public.save_liquidation(lid,'Operations',current_date,items,case when spent=0 then 'Purchase cancelled' else null end);
end $$;
set local role authenticated;

-- Actual expense scenario 1700
select set_config('test.lid',pg_temp.make_advance()::text,true);
select pg_temp.check_true(pg_temp.cash()=8000,'release reduces cash before liquidation');
select pg_temp.expenses(current_setting('test.lid')::uuid,1700,'');
select pg_temp.expect_error(format('select public.submit_liquidation(%L)',current_setting('test.lid')::uuid), 'receipt');
select pg_temp.expenses(current_setting('test.lid')::uuid,1700);
select set_config('test.proof',current_setting('test.lid')||'/90000000-0000-4000-8000-000000000099/proof.jpg',true);
insert into storage.objects(bucket_id,name) values('liquidation-receipts',current_setting('test.proof'));
select public.save_liquidation(current_setting('test.lid')::uuid,'Operations',current_date,
 jsonb_build_array(jsonb_build_object('id','90000000-0000-4000-8000-000000000099','category_id','90000000-0000-4000-8000-000000000020','particulars','Actual supplies','amount',1700,'receipt_path',current_setting('test.proof'))));
select public.submit_liquidation(current_setting('test.lid')::uuid);
select pg_temp.expect_error(format('select public.review_liquidation(%L,true)',current_setting('test.lid')::uuid), 'authorized|own');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true(not public.can_read_liquidation(current_setting('test.lid')::uuid),'other fund custodian cannot read liquidation');
select pg_temp.check_true((select count(*)=0 from storage.objects where name=current_setting('test.proof')),'unassigned custodian cannot read receipts');
select pg_temp.expect_error(format('select public.review_liquidation(%L,true)',current_setting('test.lid')::uuid),'custodian|access');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select public.review_liquidation(current_setting('test.lid')::uuid,false,'Receipt mismatch');
select pg_temp.check_true(pg_temp.cash()=8000,'flag does not move cash');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select pg_temp.expenses(current_setting('test.lid')::uuid,1700);
select public.submit_liquidation(current_setting('test.lid')::uuid);
select pg_temp.check_true((select count(*)=2 from public.liquidation_revisions where liquidation_id=current_setting('test.lid')::uuid),'submitted versions retained');
select pg_temp.check_true((select payload->'items'->0->>'receipt_path'=current_setting('test.proof') from public.liquidation_revisions where liquidation_id=current_setting('test.lid')::uuid and revision=1),'old receipt reference preserved');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select public.review_liquidation(current_setting('test.lid')::uuid,true);
select pg_temp.check_true(pg_temp.cash()=8000,'liquidation approval does not move cash');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error(format('select pg_temp.expenses(%L,100)',current_setting('test.lid')::uuid),'draft|owner');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error($q$select public.create_replenishment('90000000-0000-4000-8000-000000000010')$q$,'settled');
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,1)',current_setting('test.lid')::uuid),'exact');
select public.record_liquidation_settlement(current_setting('test.lid')::uuid,300,'Actual cash confirmed');
select pg_temp.check_true(pg_temp.cash()=8300,'settlement changes cash by difference only');
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,300)',current_setting('test.lid')::uuid),'already|cannot');
select set_config('test.repl',public.create_replenishment('90000000-0000-4000-8000-000000000010')::text,true);
select pg_temp.check_true((select total=1700 from public.replenishments where id=current_setting('test.repl')::uuid),'replenishment uses actual expense');
select public.submit_replenishment(current_setting('test.repl')::uuid);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
select public.review_replenishment(current_setting('test.repl')::uuid,true);
select pg_temp.check_true(pg_temp.cash()=8300,'replenishment approval does not move cash');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000005',true);
select public.reject_voucher(current_setting('test.voucher_id')::uuid,'Voucher needs investigation');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
select pg_temp.expect_error(format('select public.close_replenishment(%L)',current_setting('test.repl')),'ineligible');
select public.review_replenishment(current_setting('test.repl')::uuid,false,'Resolve flag first');
select pg_temp.check_true((select count(*)=1 from public.replenishment_items where replenishment_id=current_setting('test.repl')::uuid),'rejected batch retains snapshot');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000005',true);
select public.approve_voucher(current_setting('test.voucher_id')::uuid);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select set_config('test.repl',public.create_replenishment('90000000-0000-4000-8000-000000000010')::text,true);
select public.submit_replenishment(current_setting('test.repl')::uuid);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
select public.review_replenishment(current_setting('test.repl')::uuid,true);
select public.close_replenishment(current_setting('test.repl')::uuid);
select pg_temp.check_true(pg_temp.cash()=10000,'actual replenishment restores fund');
select pg_temp.expect_error(format('select public.close_replenishment(%L)',current_setting('test.repl')),'Approve');
-- Actual expense scenario 2300
select set_config('test.lid',pg_temp.make_advance()::text,true);
select pg_temp.check_true(pg_temp.cash()=8000,'release reduces cash before liquidation');
select pg_temp.expenses(current_setting('test.lid')::uuid,2300,'');
select pg_temp.expect_error(format('select public.submit_liquidation(%L)',current_setting('test.lid')::uuid), 'receipt');
select pg_temp.expenses(current_setting('test.lid')::uuid,2300);
select public.submit_liquidation(current_setting('test.lid')::uuid);
select pg_temp.expect_error(format('select public.review_liquidation(%L,true)',current_setting('test.lid')::uuid), 'authorized|own');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true(not public.can_read_liquidation(current_setting('test.lid')::uuid),'other fund custodian cannot read liquidation');
select pg_temp.expect_error(format('select public.review_liquidation(%L,true)',current_setting('test.lid')::uuid),'custodian|access');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select public.review_liquidation(current_setting('test.lid')::uuid,true);
select pg_temp.check_true(pg_temp.cash()=8000,'liquidation approval does not move cash');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error(format('select pg_temp.expenses(%L,100)',current_setting('test.lid')::uuid),'draft|owner');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error($q$select public.create_replenishment('90000000-0000-4000-8000-000000000010')$q$,'settled');
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,1)',current_setting('test.lid')::uuid),'exact');
select public.record_liquidation_settlement(current_setting('test.lid')::uuid,300,'Actual cash confirmed');
select pg_temp.check_true(pg_temp.cash()=7700,'settlement changes cash by difference only');
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,300)',current_setting('test.lid')::uuid),'already|cannot');
select set_config('test.repl',public.create_replenishment('90000000-0000-4000-8000-000000000010')::text,true);
select pg_temp.check_true((select total=2300 from public.replenishments where id=current_setting('test.repl')::uuid),'replenishment uses actual expense');
select public.submit_replenishment(current_setting('test.repl')::uuid);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
select public.review_replenishment(current_setting('test.repl')::uuid,true);
select pg_temp.check_true(pg_temp.cash()=7700,'replenishment approval does not move cash');
select public.close_replenishment(current_setting('test.repl')::uuid);
select pg_temp.check_true(pg_temp.cash()=10000,'actual replenishment restores fund');
select pg_temp.expect_error(format('select public.close_replenishment(%L)',current_setting('test.repl')),'Approve');
-- Actual expense scenario 2000
select set_config('test.lid',pg_temp.make_advance()::text,true);
select pg_temp.check_true(pg_temp.cash()=8000,'release reduces cash before liquidation');
select pg_temp.expenses(current_setting('test.lid')::uuid,2000,'');
select pg_temp.expect_error(format('select public.submit_liquidation(%L)',current_setting('test.lid')::uuid), 'receipt');
select pg_temp.expenses(current_setting('test.lid')::uuid,2000);
select public.submit_liquidation(current_setting('test.lid')::uuid);
select pg_temp.expect_error(format('select public.review_liquidation(%L,true)',current_setting('test.lid')::uuid), 'authorized|own');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true(not public.can_read_liquidation(current_setting('test.lid')::uuid),'other fund custodian cannot read liquidation');
select pg_temp.expect_error(format('select public.review_liquidation(%L,true)',current_setting('test.lid')::uuid),'custodian|access');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select public.review_liquidation(current_setting('test.lid')::uuid,true);
select pg_temp.check_true(pg_temp.cash()=8000,'liquidation approval does not move cash');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error(format('select pg_temp.expenses(%L,100)',current_setting('test.lid')::uuid),'draft|owner');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,1)',current_setting('test.lid')::uuid),'No cash adjustment');
select set_config('test.repl',public.create_replenishment('90000000-0000-4000-8000-000000000010')::text,true);
select pg_temp.check_true((select total=2000 from public.replenishments where id=current_setting('test.repl')::uuid),'replenishment uses actual expense');
select public.submit_replenishment(current_setting('test.repl')::uuid);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
select public.review_replenishment(current_setting('test.repl')::uuid,true);
select pg_temp.check_true(pg_temp.cash()=8000,'replenishment approval does not move cash');
select public.close_replenishment(current_setting('test.repl')::uuid);
select pg_temp.check_true(pg_temp.cash()=10000,'actual replenishment restores fund');
select pg_temp.expect_error(format('select public.close_replenishment(%L)',current_setting('test.repl')),'Approve');
-- Actual expense scenario 0
select set_config('test.lid',pg_temp.make_advance()::text,true);
select pg_temp.check_true(pg_temp.cash()=8000,'release reduces cash before liquidation');
select pg_temp.expenses(current_setting('test.lid')::uuid,0,'');
select public.submit_liquidation(current_setting('test.lid')::uuid);
select pg_temp.expect_error(format('select public.review_liquidation(%L,true)',current_setting('test.lid')::uuid), 'authorized|own');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true(not public.can_read_liquidation(current_setting('test.lid')::uuid),'other fund custodian cannot read liquidation');
select pg_temp.expect_error(format('select public.review_liquidation(%L,true)',current_setting('test.lid')::uuid),'custodian|access');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select public.review_liquidation(current_setting('test.lid')::uuid,true);
select pg_temp.check_true(pg_temp.cash()=8000,'liquidation approval does not move cash');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error(format('select pg_temp.expenses(%L,100)',current_setting('test.lid')::uuid),'draft|owner');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error($q$select public.create_replenishment('90000000-0000-4000-8000-000000000010')$q$,'settled');
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,1)',current_setting('test.lid')::uuid),'exact');
select public.record_liquidation_settlement(current_setting('test.lid')::uuid,2000,'Actual cash confirmed');
select pg_temp.check_true(pg_temp.cash()=10000,'settlement changes cash by difference only');
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,2000)',current_setting('test.lid')::uuid),'already|cannot');
select pg_temp.check_true((select status='closed' from public.vouchers where id=current_setting('test.voucher_id')::uuid),'fully unused advance closes after actual return');
-- Actual expense scenario 3000
select set_config('test.lid',pg_temp.make_advance()::text,true);
select pg_temp.check_true(pg_temp.cash()=8000,'release reduces cash before liquidation');
select pg_temp.expenses(current_setting('test.lid')::uuid,3000,'');
select pg_temp.expect_error(format('select public.submit_liquidation(%L)',current_setting('test.lid')::uuid), 'receipt');
select pg_temp.expenses(current_setting('test.lid')::uuid,3000);
select public.submit_liquidation(current_setting('test.lid')::uuid);
select pg_temp.expect_error(format('select public.review_liquidation(%L,true)',current_setting('test.lid')::uuid), 'authorized|own');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true(not public.can_read_liquidation(current_setting('test.lid')::uuid),'other fund custodian cannot read liquidation');
select pg_temp.expect_error(format('select public.review_liquidation(%L,true)',current_setting('test.lid')::uuid),'custodian|access');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select public.review_liquidation(current_setting('test.lid')::uuid,true);
select pg_temp.check_true(pg_temp.cash()=8000,'liquidation approval does not move cash');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error(format('select pg_temp.expenses(%L,100)',current_setting('test.lid')::uuid),'draft|owner');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error($q$select public.create_replenishment('90000000-0000-4000-8000-000000000010')$q$,'settled');
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,1)',current_setting('test.lid')::uuid),'exact');
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,1000)',current_setting('test.lid')::uuid),'approver');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000005',true);
select public.approve_liquidation_reimbursement(current_setting('test.lid')::uuid);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
reset role; update public.funds set amount=2100 where id='90000000-0000-4000-8000-000000000010'; set local role authenticated;
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,1000)',current_setting('test.lid')::uuid),'Insufficient');
reset role; update public.funds set amount=10000 where id='90000000-0000-4000-8000-000000000010'; set local role authenticated;
select public.record_liquidation_settlement(current_setting('test.lid')::uuid,1000,'Actual cash confirmed');
select pg_temp.check_true(pg_temp.cash()=7000,'settlement changes cash by difference only');
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,1000)',current_setting('test.lid')::uuid),'already|cannot');
select set_config('test.repl',public.create_replenishment('90000000-0000-4000-8000-000000000010')::text,true);
select pg_temp.check_true((select total=3000 from public.replenishments where id=current_setting('test.repl')::uuid),'replenishment uses actual expense');
select public.submit_replenishment(current_setting('test.repl')::uuid);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
select public.review_replenishment(current_setting('test.repl')::uuid,true);
select pg_temp.check_true(pg_temp.cash()=7000,'replenishment approval does not move cash');
select public.close_replenishment(current_setting('test.repl')::uuid);
select pg_temp.check_true(pg_temp.cash()=10000,'actual replenishment restores fund');
select pg_temp.expect_error(format('select public.close_replenishment(%L)',current_setting('test.repl')),'Approve');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select set_config('test.lid',pg_temp.make_advance()::text,true);
select pg_temp.expenses(current_setting('test.lid')::uuid,5001);
select public.submit_liquidation(current_setting('test.lid')::uuid);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select public.review_liquidation(current_setting('test.lid')::uuid,true);
select pg_temp.expect_error(format('select public.record_liquidation_settlement(%L,3001)',current_setting('test.lid')::uuid),'transaction limit');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000006',true);
select pg_temp.expect_error(format('select public.void_voucher(%L,%L)',current_setting('test.voucher_id'),'Do not invent cash'),'liquidation');
reset role;
select pg_temp.check_true(not has_function_privilege('anon','public.create_liquidation(uuid)','execute'),'anonymous liquidation creation denied');
select 'PASS: liquidation ownership, revisions, proofs, flags, settlement, approval boundary, no double cash, snapshots and replenishment' as result;
rollback;
