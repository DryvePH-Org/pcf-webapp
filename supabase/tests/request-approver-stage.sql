-- Phase 45: the approver clears a large budget request; the per-transaction limit is no longer a dead end.
-- All fixtures roll back.
begin;
insert into auth.users(id,email) values
('99000000-0000-4000-8000-000000000001','custodian@ra.invalid'),
('99000000-0000-4000-8000-000000000002','approver@ra.invalid'),
('99000000-0000-4000-8000-000000000004','requester@ra.invalid'),
('99000000-0000-4000-8000-000000000005','admin@ra.invalid'),
('99000000-0000-4000-8000-000000000006','requester-two@ra.invalid');
insert into profiles(id,full_name,role) values
('99000000-0000-4000-8000-000000000001','Custodian','custodian'),
('99000000-0000-4000-8000-000000000002','Fund Approver','approver'),
('99000000-0000-4000-8000-000000000004','Plain Requester','requester'),
('99000000-0000-4000-8000-000000000005','Admin','admin'),
('99000000-0000-4000-8000-000000000006','Second Requester','requester');

do $$
declare c constant uuid:='99000000-0000-4000-8000-000000000001'; a constant uuid:='99000000-0000-4000-8000-000000000002';
 r constant uuid:='99000000-0000-4000-8000-000000000004'; adm constant uuid:='99000000-0000-4000-8000-000000000005'; r2 constant uuid:='99000000-0000-4000-8000-000000000006';
 fund uuid:=gen_random_uuid(); req uuid; v uuid; refused boolean; msg text; liq uuid;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold) values(fund,'Stage fund',100000,50000,3000);
 insert into fund_custodians(fund_id,custodian_id) values(fund,c);
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform set_fund_approvers(fund,array[a]);

 -- Below the limit nothing changes: the custodian's approval is final and the voucher needs no approval.
 perform set_config('request.jwt.claim.sub',r2::text,true);
 req:=create_budget_request(fund,'Second Requester',2000,'Small');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 assert (select status from budget_requests where id=req)='approved','a small request is approved by the custodian alone';
 assert (select approver_id from budget_requests where id=req) is null,'no approver was needed';
 v:=save_workflow_voucher(null,fund,req,'Second Requester',current_date,'[{"particulars":"Small","amount":2000}]','none',null);
 assert not voucher_needs_pre_approval(v),'a small voucher needs no approval';

 -- At the limit the custodian's approval moves it on to the approver.
 perform set_config('request.jwt.claim.sub',r::text,true);
 req:=create_budget_request(fund,'Plain Requester',5000,'Large');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 assert (select status from budget_requests where id=req)='awaiting_approver','a large request waits for the approver after the custodian';
 refused:=false; begin perform save_workflow_voucher(null,fund,req,'Plain Requester',current_date,'[{"particulars":"Large","amount":5000}]','none',null); exception when others then refused:=true; end;
 assert refused,'no voucher before the approver approves';
 refused:=false; begin perform approve_request_as_approver(req,true,null); exception when others then refused:=true; end;
 assert refused,'the custodian cannot be the approver';
 perform set_config('request.jwt.claim.sub',r::text,true);
 refused:=false; begin perform approve_request_as_approver(req,true,null); exception when others then refused:=true; end;
 assert refused,'the requester cannot approve';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform approve_request_as_approver(req,true,'OK');
 assert (select status from budget_requests where id=req)='approved' and (select approver_id from budget_requests where id=req)=a,'the approver cleared it';

 -- The voucher then needs no second approval, and cannot exceed what was approved.
 perform set_config('request.jwt.claim.sub',c::text,true);
 v:=save_workflow_voucher(null,fund,req,'Plain Requester',current_date,'[{"particulars":"Large","amount":5000}]','none',null);
 assert not voucher_needs_pre_approval(v),'the voucher rides on the approver-cleared request';
 perform release_voucher(v);
 assert (select released_at from vouchers where id=v) is not null,'the cash was released without a voucher-level approval';

 -- The approver can reject, with a reason.
 perform set_config('request.jwt.claim.sub',r2::text,true);
 req:=create_budget_request(fund,'Second Requester',4000,'Rejected one');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 perform set_config('request.jwt.claim.sub',a::text,true);
 refused:=false; begin perform approve_request_as_approver(req,false,' '); exception when others then refused:=true; end;
 assert refused,'a rejection needs a reason';
 perform approve_request_as_approver(req,false,'Too much');
 assert (select status from budget_requests where id=req)='rejected','the approver rejected it';

 -- A request approved before this change still gets its approver at the voucher.
 perform set_config('request.jwt.claim.sub',r2::text,true);
 req:=create_budget_request(fund,'Second Requester',4000,'Old style');
 update budget_requests set status='approved',reviewed_by=c,reviewer_name='Custodian',reviewed_at=now() where id=req;
 perform set_config('request.jwt.claim.sub',c::text,true);
 v:=save_workflow_voucher(null,fund,req,'Second Requester',current_date,'[{"particulars":"Old","amount":4000}]','none',null);
 assert voucher_needs_pre_approval(v),'an old request keeps the voucher-level approval';
 refused:=false; begin perform release_voucher(v); exception when others then refused:=true; end;
 assert refused,'it cannot be released without the approver';

 -- An administrator or approver reviewing first is already the approver step.
 perform set_config('request.jwt.claim.sub',r2::text,true);
 req:=create_budget_request(fund,'Second Requester',4500,'Admin first');
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform review_budget_request(req,true,null);
 assert (select status from budget_requests where id=req)='approved' and (select approver_id from budget_requests where id=req)=adm,'an administrator review counts as the approver';

 -- The per-transaction limit is checked when the request is made.
 update funds set per_txn_limit=3500 where id=fund;
 perform set_config('request.jwt.claim.sub',r2::text,true);
 begin perform create_budget_request(fund,'Second Requester',4000,'Too big'); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%at most 3500%','a request above the per-transaction limit is refused with the limit: '||coalesce(msg,'(accepted)');
 req:=create_budget_request(fund,'Second Requester',3500,'Right at the limit');
 assert req is not null,'a request at the limit is fine';

 -- Spending above the per-transaction limit needs the independent approver instead of being a dead end.
 update funds set per_txn_limit=6000 where id=fund;
 perform set_config('request.jwt.claim.sub',r::text,true);
 liq:=create_liquidation((select id from vouchers where budget_request_id=(select id from budget_requests where purpose='Large')));
 update liquidations set status='approved',total_spent=7000,reviewed_by=c,reviewer_name='Custodian',reviewed_at=now() where id=liq;
 perform set_config('request.jwt.claim.sub',c::text,true);
 refused:=false; begin perform record_liquidation_settlement(liq,2000,null); exception when others then refused:=true; end;
 assert refused,'the reimbursement waits for the independent approver';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform approve_liquidation_reimbursement(liq);
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform record_liquidation_settlement(liq,2000,null);
 assert exists(select 1 from cash_settlements where liquidation_id=liq and kind='reimbursement' and amount=2000),'it can be paid once the approver approved';
 raise notice 'request-approver-stage: all checks passed';
end $$;
rollback;
