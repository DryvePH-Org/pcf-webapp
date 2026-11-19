-- Phase 47: an approver acts on anyone's items in their assigned funds, and only there. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('95000000-0000-4000-8000-000000000001','custodian@af.invalid'),
('95000000-0000-4000-8000-000000000002','approver-a@af.invalid'),
('95000000-0000-4000-8000-000000000003','approver-b@af.invalid'),
('95000000-0000-4000-8000-000000000004','requester-one@af.invalid'),
('95000000-0000-4000-8000-000000000005','admin@af.invalid'),
('95000000-0000-4000-8000-000000000006','requester-two@af.invalid'),
('95000000-0000-4000-8000-000000000007','requester-three@af.invalid');
insert into profiles(id,full_name,role) values
('95000000-0000-4000-8000-000000000001','Custodian','custodian'),
('95000000-0000-4000-8000-000000000002','Approver A','approver'),
('95000000-0000-4000-8000-000000000003','Approver B','approver'),
('95000000-0000-4000-8000-000000000004','Requester One','requester'),
('95000000-0000-4000-8000-000000000005','Admin','admin'),
('95000000-0000-4000-8000-000000000006','Requester Two','requester'),
('95000000-0000-4000-8000-000000000007','Requester Three','requester');

do $$
declare c constant uuid:='95000000-0000-4000-8000-000000000001'; a constant uuid:='95000000-0000-4000-8000-000000000002'; b constant uuid:='95000000-0000-4000-8000-000000000003';
 r1 constant uuid:='95000000-0000-4000-8000-000000000004'; adm constant uuid:='95000000-0000-4000-8000-000000000005'; r2 constant uuid:='95000000-0000-4000-8000-000000000006'; r3 constant uuid:='95000000-0000-4000-8000-000000000007';
 f1 uuid:=gen_random_uuid(); f2 uuid:=gen_random_uuid(); f3 uuid:=gen_random_uuid();
 req uuid; v uuid; liq uuid; refused boolean; rev int; filing date; lines jsonb; line uuid;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold) values(f1,'Fund one',100000,50000,3000),(f2,'Fund two',100000,50000,3000),(f3,'Fund three',100000,50000,3000);
 insert into fund_custodians(fund_id,custodian_id) values(f1,c),(f3,c);
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform set_fund_approvers(f1,array[a]);
 perform set_fund_approvers(f2,array[b]);
 assert public.fund_has_approver(f1) and not public.fund_has_approver(f3),'fund three has no assigned approver';

 -- The rule itself.
 perform set_config('request.jwt.claim.sub',a::text,true);
 assert approver_acts_in(f1) and not approver_acts_in(f2) and approver_acts_in(f3),'assigned fund and the unassigned fallback';
 perform set_config('request.jwt.claim.sub',b::text,true);
 assert not approver_acts_in(f1) and approver_acts_in(f2) and approver_acts_in(f3),'the other approver';
 assert approver_reviews_owner(f1,r1)=false and approver_reviews_owner(f2,r1),'by owner and fund';
 assert approver_reviews_owner(f2,b)=false,'never their own item';

 -- An employee's request: the assigned approver reviews it, another fund's approver cannot.
 perform set_config('request.jwt.claim.sub',r1::text,true);
 req:=create_budget_request(f1,'Requester One',2000,'Supplies');
 perform set_config('request.jwt.claim.sub',b::text,true);
 refused:=false; begin perform review_budget_request(req,true,null); exception when others then refused:=true; end;
 assert refused,'an approver of another fund cannot review the request';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform review_budget_request(req,true,null);
 assert (select status from budget_requests where id=req)='approved','the assigned approver reviewed an employee request';
 -- A fund with no assigned approver can be handled by any approver.
 perform set_config('request.jwt.claim.sub',r2::text,true);
 req:=create_budget_request(f3,'Requester Two',1500,'Fallback');
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform review_budget_request(req,true,null);
 assert (select status from budget_requests where id=req)='approved','any approver can review where nobody is assigned';

 -- The custodian prepares and releases the employee's voucher; the employee files a liquidation.
 perform set_config('request.jwt.claim.sub',c::text,true);
 req:=(select id from budget_requests where requester_id=r1);
 v:=save_workflow_voucher(null,f1,req,'Requester One',current_date,'[{"particulars":"Supplies","amount":2000}]','none',null);
 perform release_voucher(v);
 perform set_config('request.jwt.claim.sub',r1::text,true);
 liq:=create_liquidation(v);
 select filing_date into filing from liquidations where id=liq;
 line:=gen_random_uuid();
 perform save_liquidation(liq,'Ops',filing,jsonb_build_array(jsonb_build_object('id',line,'particulars','Supplies','amount',1000,'no_receipt_reason','No receipt')),null);
 perform submit_liquidation(liq);
 select receipt_review_revision into rev from liquidations where id=liq;
 lines:=jsonb_build_array(jsonb_build_object('particulars','Supplies','amount',1000,'supplier','N/A','tin','N/A','tag','MEALS','expense_date',filing,'plate','N/A','receipt_number','','physical_checked',true,'receipt_path',''));

 -- The assigned approver reviews an EMPLOYEE's liquidation and records its settlement; another fund's approver cannot.
 perform set_config('request.jwt.claim.sub',b::text,true);
 refused:=false; begin perform save_custodian_receipts(liq,rev,lines); exception when others then refused:=true; end;
 assert refused,'another fund approver cannot review the receipts';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform save_custodian_receipts(liq,rev,lines);
 perform review_liquidation_before_sheets(liq,true,null);
 assert (select status from liquidations where id=liq)='approved','the assigned approver approved an employee liquidation';
 perform set_config('request.jwt.claim.sub',b::text,true);
 refused:=false; begin perform record_liquidation_settlement(liq,1000,null); exception when others then refused:=true; end;
 assert refused,'another fund approver cannot record the settlement';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform record_liquidation_settlement(liq,1000,null);
 assert exists(select 1 from cash_settlements where liquidation_id=liq),'the assigned approver recorded the settlement';

 -- A voucher at the limit made without a request: only the assigned approver approves it.
 perform set_config('request.jwt.claim.sub',c::text,true);
 v:=save_workflow_voucher(null,f1,null,'Requester Two',current_date,'[{"particulars":"Direct","amount":4000}]','none',null);
 perform submit_voucher(v);
 perform set_config('request.jwt.claim.sub',b::text,true);
 refused:=false; begin perform approve_voucher(v); exception when others then refused:=true; end;
 assert refused,'an approver of another fund cannot approve the voucher';
 refused:=false; begin perform return_voucher(v,'No'); exception when others then refused:=true; end;
 assert refused,'nor return it';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform approve_voucher(v);
 assert (select status from vouchers where id=v)='approved','the assigned approver approved it';

 -- The approver step on a large request.
 perform set_config('request.jwt.claim.sub',r3::text,true);
 req:=create_budget_request(f1,'Requester Three',5000,'Large');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 perform set_config('request.jwt.claim.sub',b::text,true);
 refused:=false; begin perform approve_request_as_approver(req,true,null); exception when others then refused:=true; end;
 assert refused,'an approver of another fund cannot clear a large request';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform approve_request_as_approver(req,true,null);
 assert (select status from budget_requests where id=req)='approved','the assigned approver cleared it';

 -- Cancelling an unused advance of an employee.
 perform set_config('request.jwt.claim.sub',c::text,true);
 v:=save_workflow_voucher(null,f1,req,'Requester Three',current_date,'[{"particulars":"Large","amount":5000}]','none',null);
 perform release_voucher(v);
 perform set_config('request.jwt.claim.sub',b::text,true);
 refused:=false; begin perform cancel_unused_advance(v,'plan_changed',null,false,null); exception when others then refused:=true; end;
 assert refused,'an approver of another fund cannot cancel the advance';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform cancel_unused_advance(v,'plan_changed',null,false,null);
 assert (select status from vouchers where id=v)='void','the assigned approver cancelled the advance';

 -- The extra reimbursement.
 update liquidations set status='approved',total_spent=amount_received+500 where id=liq;
 delete from cash_settlements where liquidation_id=liq;
 perform set_config('request.jwt.claim.sub',b::text,true);
 refused:=false; begin perform approve_liquidation_reimbursement(liq); exception when others then refused:=true; end;
 assert refused,'an approver of another fund cannot approve the reimbursement';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform approve_liquidation_reimbursement(liq);
 assert (select reimbursement_approved_by from liquidations where id=liq)=a,'the assigned approver approved the reimbursement';
 raise notice 'approver-fund-scope: all checks passed';
end $$;
rollback;
