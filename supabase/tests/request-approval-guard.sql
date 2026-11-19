-- Phase 50: a request that needs an approver can never sit approved without one. All fixtures roll back.
begin;
insert into auth.users(id,email) values
('98000000-0000-4000-8000-000000000001','custodian@rg.invalid'),
('98000000-0000-4000-8000-000000000002','approver@rg.invalid'),
('98000000-0000-4000-8000-000000000003','requester-one@rg.invalid'),
('98000000-0000-4000-8000-000000000004','requester-two@rg.invalid'),
('98000000-0000-4000-8000-000000000005','requester-three@rg.invalid'),
('98000000-0000-4000-8000-000000000006','admin@rg.invalid');
insert into profiles(id,full_name,role) values
('98000000-0000-4000-8000-000000000001','Custodian','custodian'),
('98000000-0000-4000-8000-000000000002','Fund Approver','approver'),
('98000000-0000-4000-8000-000000000003','Requester One','requester'),
('98000000-0000-4000-8000-000000000004','Requester Two','requester'),
('98000000-0000-4000-8000-000000000005','Requester Three','requester'),
('98000000-0000-4000-8000-000000000006','Admin','admin');

do $$
declare c constant uuid:='98000000-0000-4000-8000-000000000001'; a constant uuid:='98000000-0000-4000-8000-000000000002';
 r1 constant uuid:='98000000-0000-4000-8000-000000000003'; r2 constant uuid:='98000000-0000-4000-8000-000000000004';
 r3 constant uuid:='98000000-0000-4000-8000-000000000005'; adm constant uuid:='98000000-0000-4000-8000-000000000006';
 fund uuid:=gen_random_uuid(); req uuid; v uuid; msg text; moved int;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold) values(fund,'Guard fund',100000,50000,3000);
 insert into fund_custodians(fund_id,custodian_id) values(fund,c);
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform set_fund_approvers(fund,array[a]);

 -- 1. Whoever changes the row, a request that needs an approver cannot become approved without one.
 perform set_config('request.jwt.claim.sub',r1::text,true);
 req:=create_budget_request(fund,'Requester One',5000,'Large');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 assert (select status from budget_requests where id=req)='awaiting_approver','the custodian sends a large request to the approver';
 begin update budget_requests set status='approved' where id=req; msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%needs an approver%','a direct change to approved is refused: '||coalesce(msg,'(accepted)');
 begin update budget_requests set status='voucher_created' where id=req; msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%needs an approver%','nor straight to a voucher: '||coalesce(msg,'(accepted)');

 -- A small request is still approved by the custodian alone and the sweep leaves it be.
 perform set_config('request.jwt.claim.sub',r2::text,true);
 req:=create_budget_request(fund,'Requester Two',2000,'Small');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 assert (select status from budget_requests where id=req)='approved','a small request is approved by the custodian alone';
 moved:=resync_request_approvals(fund);
 assert moved=0,'the sweep moved nothing: '||moved;
 assert (select status from budget_requests where id=req)='approved','the small request is left alone';

 -- 2. A large request found approved without its approver (the old flow) goes back to the approver.
 perform set_config('request.jwt.claim.sub',r3::text,true);
 req:=create_budget_request(fund,'Requester Three',4000,'Old style');
 alter table budget_requests disable trigger budget_requests_approver_guard;
 update budget_requests set status='approved',reviewed_by=c,reviewer_name='Custodian',reviewed_at=now() where id=req;
 alter table budget_requests enable trigger budget_requests_approver_guard;
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform save_workflow_voucher(null,fund,req,'Requester Three',current_date,'[{"particulars":"Old","amount":4000}]','none',null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%needs an approver%','its voucher is refused with the real reason: '||coalesce(msg,'(accepted)');
 moved:=resync_request_approvals(fund);
 assert moved=1,'the sweep moved it: '||moved;
 assert (select status from budget_requests where id=req)='awaiting_approver','it is awaiting the approver again';
 assert exists(select 1 from notifications where user_id=a and event='budget.needs_approver' and entity_id=req),'the approver was told';
 assert not exists(select 1 from notifications where user_id=c and entity_id=req),'the custodian who reviewed it is not asked to approve it';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform approve_request_as_approver(req,true,null);
 perform set_config('request.jwt.claim.sub',c::text,true);
 v:=save_workflow_voucher(null,fund,req,'Requester Three',current_date,'[{"particulars":"Old","amount":4000}]','none',null);
 assert v is not null,'once the approver approves, the voucher can be created';

 -- 3. A request the approver approved can go above the per-transaction limit, up to the approved amount.
 perform set_config('request.jwt.claim.sub',r1::text,true);
 req:=create_budget_request(fund,'Requester One',5000,'Above the limit');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform approve_request_as_approver(req,true,null);
 update funds set per_txn_limit=3000 where id=fund;
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform save_workflow_voucher(null,fund,req,'Requester One',current_date,'[{"particulars":"Too much","amount":5200}]','none',null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'it cannot exceed what the approver approved';
 v:=save_workflow_voucher(null,fund,req,'Requester One',current_date,'[{"particulars":"Docs","amount":5000}]','none',null);
 assert (select amount from vouchers where id=v)=5000,'the approved 5000 goes through above the limit of 3000';
 perform save_workflow_voucher(v,null,null,'Requester One',current_date,'[{"particulars":"Docs","amount":4500}]','none',null);
 assert (select amount from vouchers where id=v)=4500,'editing the draft within the approved amount works';
 begin perform save_workflow_voucher(v,null,null,'Requester One',current_date,'[{"particulars":"Docs","amount":5200}]','none',null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%per-transaction limit of 3000%','editing above the approved amount is refused with the limit: '||coalesce(msg,'(accepted)');
 begin perform save_workflow_voucher(null,fund,null,'Requester One',current_date,'[{"particulars":"Direct","amount":3500}]','none',null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%above the fund%per-transaction limit of 3000%make the request first%','a voucher with no request above the limit is refused in plain words: '||coalesce(msg,'(accepted)');

 -- 4. Changing a fund's limits cannot strand an approved request.
 update funds set per_txn_limit=50000,approval_threshold=20000 where id=fund;
 perform set_config('request.jwt.claim.sub',r2::text,true);
 req:=create_budget_request(fund,'Requester Two',6000,'Fine today');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 assert (select status from budget_requests where id=req)='approved','under the higher limit the custodian approves it alone';
 update funds set approval_threshold=3000 where id=fund;
 assert (select status from budget_requests where id=req)='awaiting_approver','lowering the approval limit sends it to the approver';
 assert exists(select 1 from notifications where user_id=a and entity_id=req),'and the approver is told';

 -- 5. Above the per-transaction limit always needs an approver, even when the approval limit is higher.
 update funds set approval_threshold=40000,per_txn_limit=8000 where id=fund;
 assert request_needs_approver(fund,8001) and not request_needs_approver(fund,7999),'the per-transaction limit alone brings in the approver';
 raise notice 'request-approval-guard: all checks passed';
end $$;
rollback;
