-- Phase 46: who may approve an extra reimbursement. All fixtures roll back.
begin;
insert into auth.users(id,email) values
('96000000-0000-4000-8000-000000000001','custodian@rr.invalid'),
('96000000-0000-4000-8000-000000000002','approver@rr.invalid'),
('96000000-0000-4000-8000-000000000005','admin@rr.invalid');
insert into profiles(id,full_name,role) values
('96000000-0000-4000-8000-000000000001','Own Custodian','custodian'),
('96000000-0000-4000-8000-000000000002','Fund Approver','approver'),
('96000000-0000-4000-8000-000000000005','Admin','admin');

do $$
declare c constant uuid:='96000000-0000-4000-8000-000000000001'; a constant uuid:='96000000-0000-4000-8000-000000000002'; adm constant uuid:='96000000-0000-4000-8000-000000000005';
 fund uuid:=gen_random_uuid(); req uuid; v uuid; liq uuid; refused boolean;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold) values(fund,'Rule fund',100000,50000,3000);
 insert into fund_custodians(fund_id,custodian_id) values(fund,c);
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform set_fund_approvers(fund,array[a]);

 -- The custodian's own request: the approver reviews it, prepares the voucher, releases it and reviews the liquidation.
 perform set_config('request.jwt.claim.sub',c::text,true);
 req:=create_budget_request(fund,'Own Custodian',2000,'Own supplies');
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform review_budget_request(req,true,null);
 v:=save_workflow_voucher(null,fund,req,'Own Custodian',current_date,'[{"particulars":"Own","amount":2000}]','none',null);
 perform release_voucher(v);
 perform set_config('request.jwt.claim.sub',c::text,true);
 liq:=create_liquidation(v);
 -- She spent more than the advance, and the approver is the one who approved her liquidation.
 update liquidations set status='approved',total_spent=3500,reviewed_by=a,reviewer_name='Fund Approver',reviewed_at=now() where id=liq;

 -- The employee being paid cannot approve her own reimbursement.
 refused:=false; begin perform approve_liquidation_reimbursement(liq); exception when others then refused:=true; end;
 assert refused,'the person being paid cannot approve it';
 -- The approver who reviewed the liquidation can.
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform approve_liquidation_reimbursement(liq);
 assert (select reimbursement_approved_by from liquidations where id=liq)=a,'the fund approver approved the reimbursement';
 refused:=false; begin perform approve_liquidation_reimbursement(liq); exception when others then refused:=true; end;
 assert refused,'it cannot be approved twice';
 raise notice 'reimbursement-approver-rule: all checks passed';
end $$;
rollback;
