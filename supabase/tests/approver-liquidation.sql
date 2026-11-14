-- Phase 43: the assigned approver reviews a custodian's own liquidation. All fixtures roll back.
begin;
insert into auth.users(id,email) values
('97000000-0000-4000-8000-000000000001','custodian@al.invalid'),
('97000000-0000-4000-8000-000000000002','approver@al.invalid'),
('97000000-0000-4000-8000-000000000003','other-approver@al.invalid'),
('97000000-0000-4000-8000-000000000004','requester@al.invalid'),
('97000000-0000-4000-8000-000000000005','admin@al.invalid'),
('97000000-0000-4000-8000-000000000006','custodian-two@al.invalid');
insert into profiles(id,full_name,role) values
('97000000-0000-4000-8000-000000000001','Only Custodian','custodian'),
('97000000-0000-4000-8000-000000000002','Fund Approver','approver'),
('97000000-0000-4000-8000-000000000003','Other Approver','approver'),
('97000000-0000-4000-8000-000000000004','Plain Requester','requester'),
('97000000-0000-4000-8000-000000000005','Admin','admin'),
('97000000-0000-4000-8000-000000000006','Second Custodian','custodian');

do $$
declare c uuid:='97000000-0000-4000-8000-000000000001'; c1 constant uuid:='97000000-0000-4000-8000-000000000001'; c2 constant uuid:='97000000-0000-4000-8000-000000000006'; a constant uuid:='97000000-0000-4000-8000-000000000002';
 b constant uuid:='97000000-0000-4000-8000-000000000003'; r constant uuid:='97000000-0000-4000-8000-000000000004'; adm constant uuid:='97000000-0000-4000-8000-000000000005';
 fund uuid; flag boolean; req uuid; v uuid; liq uuid; rev int; refused boolean; filing date; lines jsonb; line uuid;
begin
 foreach flag in array array[false,true] loop
  -- each round has its own custodian: one with an unfinished liquidation cannot ask for more budget
  c:=case when flag then c2 else c1 end;
  fund:=gen_random_uuid();
  insert into funds(id,name,amount,per_txn_limit,approval_threshold,custodian_self_approval) values(fund,'Fund '||flag::text,100000,50000,30000,flag);
  insert into fund_custodians(fund_id,custodian_id) values(fund,c);
  perform set_config('request.jwt.claim.sub',adm::text,true);
  perform set_fund_approvers(fund,array[a]);

  -- The custodian asks for budget in her own fund; the assigned approver handles the rest.
  perform set_config('request.jwt.claim.sub',c::text,true);
  req:=create_budget_request(fund,'Only Custodian',1500,'Supplies');
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform review_budget_request(req,true,null);
  v:=save_workflow_voucher(null,fund,req,'Only Custodian',current_date,'[{"particulars":"Supplies","amount":1500}]','none',null);
  perform release_voucher(v);

  perform set_config('request.jwt.claim.sub',c::text,true);
  liq:=create_liquidation(v);
  select filing_date into filing from liquidations where id=liq;
  line:=gen_random_uuid();
  perform save_liquidation(liq,'Ops',filing,jsonb_build_array(jsonb_build_object('id',line,'particulars','Supplies','amount',1000,'no_receipt_reason','No receipt')),null);
  perform submit_liquidation(liq);
  select receipt_review_revision into rev from liquidations where id=liq;
  lines:=jsonb_build_array(jsonb_build_object('particulars','Supplies','amount',1000,'supplier','N/A','tin','N/A','tag','MEALS','expense_date',filing,'plate','N/A','receipt_number','','physical_checked',true,'receipt_path',''));

  -- An approver who is not assigned to the fund cannot touch it.
  perform set_config('request.jwt.claim.sub',b::text,true);
  refused:=false; begin perform save_custodian_receipts(liq,rev,lines); exception when others then refused:=true; end;
  assert refused,'an unassigned approver cannot review the receipts (self-approval '||flag::text||')';
  refused:=false; begin perform review_liquidation_before_sheets(liq,true,null); exception when others then refused:=true; end;
  assert refused,'an unassigned approver cannot approve (self-approval '||flag::text||')';

  -- The assigned approver reviews the receipts and approves.
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform save_custodian_receipts(liq,rev,lines);
  assert (select receipt_reviewed_by from liquidations where id=liq)=a,'the approver is recorded as the receipt reviewer';
  perform review_liquidation_before_sheets(liq,true,null);
  assert (select status from liquidations where id=liq)='approved','the approver approved it (self-approval '||flag::text||')';
  assert (select reviewed_by from liquidations where id=liq)=a,'reviewed by the approver';

  -- And records the settlement; an unassigned approver cannot.
  perform set_config('request.jwt.claim.sub',b::text,true);
  refused:=false; begin perform record_liquidation_settlement(liq,500,null); exception when others then refused:=true; end;
  assert refused,'an unassigned approver cannot record the settlement';
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform record_liquidation_settlement(liq,500,null);
  assert exists(select 1 from cash_settlements where liquidation_id=liq),'the approver recorded the settlement';

  -- The approver can also flag one.
  perform set_config('request.jwt.claim.sub',c::text,true);
  req:=create_budget_request(fund,'Only Custodian',900,'More supplies');
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform review_budget_request(req,true,null);
  v:=save_workflow_voucher(null,fund,req,'Only Custodian',current_date,'[{"particulars":"More","amount":900}]','none',null);
  perform release_voucher(v);
  perform set_config('request.jwt.claim.sub',c::text,true);
  liq:=create_liquidation(v);
  select filing_date into filing from liquidations where id=liq;
  perform save_liquidation(liq,'Ops',filing,jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'particulars','More','amount',500,'no_receipt_reason','No receipt')),null);
  perform submit_liquidation(liq);
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform review_liquidation_before_sheets(liq,false,'Please add the receipt');
  assert (select status from liquidations where id=liq)='flagged','the approver flagged it';
 end loop;

 -- An approver does not cover a liquidation owned by someone who is not a custodian of the fund.
 c:=c1;
 fund:=gen_random_uuid();
 insert into funds(id,name,amount,per_txn_limit,approval_threshold) values(fund,'Plain fund',100000,50000,30000);
 insert into fund_custodians(fund_id,custodian_id) values(fund,c);
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform set_fund_approvers(fund,array[a]);
 perform set_config('request.jwt.claim.sub',r::text,true);
 req:=create_budget_request(fund,'Plain Requester',800,'Printing');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 v:=save_workflow_voucher(null,fund,req,'Plain Requester',current_date,'[{"particulars":"Printing","amount":800}]','none',null);
 perform release_voucher(v);
 perform set_config('request.jwt.claim.sub',r::text,true);
 liq:=create_liquidation(v);
 select filing_date into filing from liquidations where id=liq;
 perform save_liquidation(liq,'Ops',filing,jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'particulars','Printing','amount',500,'no_receipt_reason','No receipt')),null);
 perform submit_liquidation(liq);
 perform set_config('request.jwt.claim.sub',a::text,true);
 refused:=false; begin perform review_liquidation_before_sheets(liq,true,null); exception when others then refused:=true; end;
 assert refused,'the approver does not review an ordinary requester''s liquidation';
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_liquidation_before_sheets(liq,true,null);
 assert (select status from liquidations where id=liq)='approved','the custodian still reviews an ordinary requester''s liquidation';
end $$;
rollback;
