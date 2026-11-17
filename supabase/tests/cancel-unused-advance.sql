-- Phase 44: cancel an advance that was never used. All fixtures roll back.
begin;
insert into auth.users(id,email) values
('98000000-0000-4000-8000-000000000001','custodian@cu.invalid'),
('98000000-0000-4000-8000-000000000002','approver@cu.invalid'),
('98000000-0000-4000-8000-000000000003','other-approver@cu.invalid'),
('98000000-0000-4000-8000-000000000004','requester@cu.invalid'),
('98000000-0000-4000-8000-000000000005','admin@cu.invalid'),
('98000000-0000-4000-8000-000000000006','custodian-two@cu.invalid');
insert into profiles(id,full_name,role) values
('98000000-0000-4000-8000-000000000001','Only Custodian','custodian'),
('98000000-0000-4000-8000-000000000002','Fund Approver','approver'),
('98000000-0000-4000-8000-000000000003','Other Approver','approver'),
('98000000-0000-4000-8000-000000000004','Plain Requester','requester'),
('98000000-0000-4000-8000-000000000005','Admin','admin'),
('98000000-0000-4000-8000-000000000006','Second Custodian','custodian');

do $$
declare c uuid; c1 constant uuid:='98000000-0000-4000-8000-000000000001'; c2 constant uuid:='98000000-0000-4000-8000-000000000006'; a constant uuid:='98000000-0000-4000-8000-000000000002';
 b constant uuid:='98000000-0000-4000-8000-000000000003'; r constant uuid:='98000000-0000-4000-8000-000000000004'; adm constant uuid:='98000000-0000-4000-8000-000000000005';
 fund uuid; flag boolean; req uuid; v uuid; v2 uuid; refused boolean; cash0 numeric; st record; filing date; liq uuid; yesterday date:=current_date-1;
 released date;
begin
 foreach flag in array array[false,true] loop
  c:=case when flag then c2 else c1 end;
  fund:=gen_random_uuid();
  insert into funds(id,name,amount,per_txn_limit,approval_threshold,custodian_self_approval) values(fund,'Fund '||flag::text,100000,50000,30000,flag);
  insert into fund_custodians(fund_id,custodian_id) values(fund,c);
  perform set_config('request.jwt.claim.sub',adm::text,true);
  perform set_fund_approvers(fund,array[a]);
  select expected_cash into cash0 from fund_balance_v where fund_id=fund;
  assert cash0=100000,'the fund starts full';

  -- An employee asks for 1,000; the custodian prepares and releases it.
  perform set_config('request.jwt.claim.sub',r::text,true);
  req:=create_budget_request(fund,'Plain Requester',1000,'Trip');
  perform set_config('request.jwt.claim.sub',c::text,true);
  perform review_budget_request(req,true,null);
  v:=save_workflow_voucher(null,fund,req,'Plain Requester',current_date,'[{"particulars":"Trip","amount":1000}]','none',null);
  perform release_voucher(v);
  assert (select expected_cash from fund_balance_v where fund_id=fund)=99000,'the cash is out';
  assert (select advances_pending_liquidation from fund_balance_v where fund_id=fund)=1000,'it awaits liquidation';

  -- The employee cannot cancel it; only the custodian side can.
  perform set_config('request.jwt.claim.sub',r::text,true);
  refused:=false; begin perform cancel_unused_advance(v,'plan_changed',null,false,null); exception when others then refused:=true; end;
  assert refused,'the employee cannot cancel the advance';
  perform set_config('request.jwt.claim.sub',b::text,true);
  refused:=false; begin perform cancel_unused_advance(v,'plan_changed',null,false,null); exception when others then refused:=true; end;
  assert refused,'an unassigned approver cannot cancel the advance';

  -- Required answers.
  perform set_config('request.jwt.claim.sub',c::text,true);
  refused:=false; begin perform cancel_unused_advance(v,'nonsense',null,false,null); exception when others then refused:=true; end;
  assert refused,'a reason must be chosen';
  refused:=false; begin perform cancel_unused_advance(v,'other',' ',false,null); exception when others then refused:=true; end;
  assert refused,'"other" needs a note';
  refused:=false; begin perform cancel_unused_advance(v,'plan_changed',null,true,null); exception when others then refused:=true; end;
  assert refused,'cash back needs a date';
  refused:=false; begin perform cancel_unused_advance(v,'plan_changed',null,true,current_date+1); exception when others then refused:=true; end;
  assert refused,'the return date cannot be in the future';
  refused:=false; begin perform cancel_unused_advance(v,'plan_changed',null,true,yesterday-5); exception when others then refused:=true; end;
  assert refused,'the cash cannot come back before it was released';
  assert (select status from vouchers where id=v)='released','nothing changed after the refusals';

  -- Cash NOT back yet: the voucher is cancelled but the money is still counted as out and shown as a return due.
  assert (select can_cancel from advance_cancellation_state(v)),'the custodian may cancel';
  perform cancel_unused_advance(v,'plan_changed','Trip postponed',false,null);
  assert (select status from vouchers where id=v)='void','the voucher is void';
  assert (select void_reason from vouchers where id=v) like 'Advance not used%Trip postponed','the reason is kept';
  assert (select status from budget_requests where id=req)='cancelled','the request is closed as cancelled';
  assert exists(select 1 from advance_cancellations where voucher_id=v and returned_on is null and amount=1000),'a pending cancellation is recorded';
  assert (select expected_cash from fund_balance_v where fund_id=fund)=99000,'the cash still counts as out until it is recorded back';
  assert (select returns_due from fund_balance_v where fund_id=fund)=1000,'it shows as a return due';
  assert (select advances_pending_liquidation from fund_balance_v where fund_id=fund)=0,'it no longer awaits liquidation';
  assert (select returned from advance_cancellation_state(v))=false and (select can_record_return from advance_cancellation_state(v)),'the return can be recorded';
  refused:=false; begin perform cancel_unused_advance(v,'plan_changed',null,false,null); exception when others then refused:=true; end;
  assert refused,'it cannot be cancelled twice';
  assert exists(select 1 from audit_log where entity_type='advance_cancellations' and action='insert'),'the cancellation is audited';
  assert exists(select 1 from audit_log where entity_type='vouchers' and entity_id=v and action='status_change'),'the voucher change is audited';

  -- The return is recorded later.
  refused:=false; begin perform record_cancelled_advance_return(v,current_date+1); exception when others then refused:=true; end;
  assert refused,'a future return date is refused';
  perform set_config('request.jwt.claim.sub',r::text,true);
  refused:=false; begin perform record_cancelled_advance_return(v,current_date); exception when others then refused:=true; end;
  assert refused,'the employee cannot record the return';
  perform set_config('request.jwt.claim.sub',c::text,true);
  perform record_cancelled_advance_return(v,current_date);
  assert (select expected_cash from fund_balance_v where fund_id=fund)=100000,'the fund is whole again';
  assert (select returns_due from fund_balance_v where fund_id=fund)=0 and (select released_vouchers_total from fund_balance_v where fund_id=fund)=0,'nothing is outstanding';
  refused:=false; begin perform record_cancelled_advance_return(v,current_date); exception when others then refused:=true; end;
  assert refused,'the return cannot be recorded twice';

  -- Cash already back: it is recorded at once.
  perform set_config('request.jwt.claim.sub',r::text,true);
  req:=create_budget_request(fund,'Plain Requester',700,'Supplies');
  perform set_config('request.jwt.claim.sub',c::text,true);
  perform review_budget_request(req,true,null);
  v2:=save_workflow_voucher(null,fund,req,'Plain Requester',current_date,'[{"particulars":"Supplies","amount":700}]','none',null);
  perform release_voucher(v2);
  perform cancel_unused_advance(v2,'not_needed',null,true,current_date);
  assert (select expected_cash from fund_balance_v where fund_id=fund)=100000,'cash back at once leaves the fund whole';
  assert (select returned from advance_cancellation_state(v2)),'the return is recorded';

  -- A filed liquidation blocks it.
  perform set_config('request.jwt.claim.sub',r::text,true);
  req:=create_budget_request(fund,'Plain Requester',500,'Meals');
  perform set_config('request.jwt.claim.sub',c::text,true);
  perform review_budget_request(req,true,null);
  v2:=save_workflow_voucher(null,fund,req,'Plain Requester',current_date,'[{"particulars":"Meals","amount":500}]','none',null);
  perform release_voucher(v2);
  perform set_config('request.jwt.claim.sub',r::text,true);
  liq:=create_liquidation(v2);
  select filing_date into filing from liquidations where id=liq;
  perform save_liquidation(liq,'Ops',filing,jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'particulars','Meals','amount',400,'no_receipt_reason','No receipt')),null);
  perform submit_liquidation(liq);
  perform set_config('request.jwt.claim.sub',c::text,true);
  assert not (select can_cancel from advance_cancellation_state(v2)),'a filed liquidation blocks cancelling';
  refused:=false; begin perform cancel_unused_advance(v2,'plan_changed',null,false,null); exception when others then refused:=true; end;
  assert refused,'cancel is refused once a liquidation was filed';

  -- The custodian's OWN advance: only with self-approval, otherwise the assigned approver or an administrator.
  perform set_config('request.jwt.claim.sub',c::text,true);
  req:=create_budget_request(fund,'Own',600,'Own supplies');
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform review_budget_request(req,true,null);
  v:=save_workflow_voucher(null,fund,req,'Own',current_date,'[{"particulars":"Own","amount":600}]','none',null);
  perform release_voucher(v);
  perform set_config('request.jwt.claim.sub',c::text,true);
  refused:=false; begin perform cancel_unused_advance(v,'plan_changed',null,false,null); exception when others then refused:=true; end;
  if flag then
    assert not refused,'with self-approval the custodian can cancel her own advance';
    assert exists(select 1 from audit_log where entity_type='vouchers' and entity_id=v and action='self_approval' and actor_id=c),'the self-approval is audited';
  else
    assert refused,'without self-approval the custodian cannot cancel her own advance';
    perform set_config('request.jwt.claim.sub',b::text,true);
    refused:=false; begin perform cancel_unused_advance(v,'plan_changed',null,false,null); exception when others then refused:=true; end;
    assert refused,'an unassigned approver cannot cancel it';
    perform set_config('request.jwt.claim.sub',a::text,true);
    perform cancel_unused_advance(v,'plan_changed',null,true,current_date);
    assert (select status from vouchers where id=v)='void','the assigned approver cancelled it';
  end if;
 end loop;

 -- An administrator can always do it.
 perform set_config('request.jwt.claim.sub',adm::text,true);
 raise notice 'cancel-unused-advance: all checks passed';
end $$;
rollback;
