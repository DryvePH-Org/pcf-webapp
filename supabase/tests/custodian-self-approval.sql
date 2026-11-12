-- Phase 40: a fund can let a custodian approve her own request and liquidation (audited).
-- All fixtures roll back. Run only against an isolated database.
begin;
insert into auth.users(id,email) values
('95000000-0000-4000-8000-000000000001','custodian@sa.invalid'),
('95000000-0000-4000-8000-000000000002','admin@sa.invalid');
insert into profiles(id,full_name,role) values
('95000000-0000-4000-8000-000000000001','Self Custodian','custodian'),
('95000000-0000-4000-8000-000000000002','Admin','admin');
insert into funds(id,name,amount,per_txn_limit,approval_threshold) values
('95000000-0000-4000-8000-000000000010','Strict fund',100000,50000,30000),
('95000000-0000-4000-8000-000000000011','Self-approval fund',100000,50000,30000);
insert into fund_custodians(fund_id,custodian_id) values
('95000000-0000-4000-8000-000000000010','95000000-0000-4000-8000-000000000001'),
('95000000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000001');

do $$
declare strict_req uuid; own_req uuid; voucher uuid; liq uuid; refused boolean; n int;
begin
 -- Only an administrator turns it on.
 perform set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
 refused:=false;
 begin perform set_fund_self_approval('95000000-0000-4000-8000-000000000011',true); exception when others then refused:=true; end;
 assert refused,'a custodian cannot switch on self-approval';
 perform set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000002',true);
 perform set_fund_self_approval('95000000-0000-4000-8000-000000000011',true);
 assert self_approval_allowed('95000000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000001'),'allowed on the fund that is switched on';
 assert not self_approval_allowed('95000000-0000-4000-8000-000000000010','95000000-0000-4000-8000-000000000001'),'still not allowed on the other fund';

 -- A fund that is off keeps the old rule.
 perform set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
 strict_req:=create_budget_request('95000000-0000-4000-8000-000000000010','Self Custodian',1000,'Strict fund request');
 refused:=false;
 begin perform review_budget_request(strict_req,true,null); exception when others then refused:=true; end;
 assert refused,'she cannot approve her own request where self-approval is off';

 -- Where it is on she approves, prepares the voucher and releases it herself.
 own_req:=create_budget_request('95000000-0000-4000-8000-000000000011','Self Custodian',1500,'Own request');
 perform review_budget_request(own_req,true,null);
 assert (select status from budget_requests where id=own_req)='approved','she approved her own request';
 voucher:=save_workflow_voucher(null,'95000000-0000-4000-8000-000000000011',own_req,'Self Custodian',current_date,
   '[{"particulars":"Supplies","amount":1500}]','none',null);
 assert (select budget_request_id from vouchers where id=voucher)=own_req,'she prepared the voucher for her own request';
 update vouchers set status='released', released_at=now() where id=voucher;
 assert (select released_at is not null from vouchers where id=voucher),'she released the cash for her own request';

 -- Her liquidation: file, submit, approve and settle it herself.
 liq:=create_liquidation(voucher);
 perform save_liquidation(liq,'Operations',(select filing_date from liquidations where id=liq),
   '[{"id":"95000000-0000-4000-8000-0000000000a1","particulars":"Supplies","amount":1000,"no_receipt_reason":"No receipt"}]'::jsonb,null);
 perform submit_liquidation(liq);
 perform review_liquidation_before_sheets(liq,true,null);
 assert (select status from liquidations where id=liq)='approved','she approved her own liquidation';
 perform record_liquidation_settlement(liq,500,null);
 assert exists(select 1 from cash_settlements where liquidation_id=liq),'she recorded her own settlement';

 -- Every step is on the audit log.
 select count(*) into n from audit_log where action='self_approval' and actor_id='95000000-0000-4000-8000-000000000001';
 assert n=5,'five audited self-approval steps, found '||n;
 assert exists(select 1 from audit_log where action='self_approval' and new_data->>'step'='request_review'),'request review audited';
 assert exists(select 1 from audit_log where action='self_approval' and new_data->>'step'='voucher_prepared'),'voucher preparation audited';
 assert exists(select 1 from audit_log where action='self_approval' and new_data->>'step'='cash_released'),'cash release audited';
 assert exists(select 1 from audit_log where action='self_approval' and new_data->>'step'='liquidation_review'),'liquidation review audited';
 assert exists(select 1 from audit_log where action='self_approval' and new_data->>'step'='settlement_recorded'),'settlement audited';

 -- Switching it off puts the old rule back.
 perform set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000002',true);
 perform set_fund_self_approval('95000000-0000-4000-8000-000000000011',false);
 perform set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
 own_req:=create_budget_request('95000000-0000-4000-8000-000000000011','Self Custodian',700,'After it is off');
 refused:=false;
 begin perform review_budget_request(own_req,true,null); exception when others then refused:=true; end;
 assert refused,'self-approval stops once the fund switches it off';
end $$;
rollback;
