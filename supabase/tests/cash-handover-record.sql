-- Phase 59: the real handover day and amount are recorded when accounting confirms the cash handover. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('96400000-0000-4000-8000-000000000001','custodian@ch.invalid'),
('96400000-0000-4000-8000-000000000002','requester@ch.invalid'),
('96400000-0000-4000-8000-000000000003','accounting@ch.invalid'),
('96400000-0000-4000-8000-000000000004','admin@ch.invalid');
insert into profiles(id,full_name,role) values
('96400000-0000-4000-8000-000000000001','Custodian','custodian'),
('96400000-0000-4000-8000-000000000002','Requester','requester'),
('96400000-0000-4000-8000-000000000003','Accounting','accounting'),
('96400000-0000-4000-8000-000000000004','Admin','admin');

do $$
declare c constant uuid:='96400000-0000-4000-8000-000000000001'; r constant uuid:='96400000-0000-4000-8000-000000000002';
 acc constant uuid:='96400000-0000-4000-8000-000000000003'; adm constant uuid:='96400000-0000-4000-8000-000000000004';
 dbf uuid:=gen_random_uuid(); req uuid; v uuid; liq uuid; filing date; rev int; rep uuid; msg text; lines jsonb; today date:=(now() at time zone 'Asia/Manila')::date;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold,sheet_ledger) values(dbf,'Handover fund',100000,50000,9000,false);
 insert into fund_custodians(fund_id,custodian_id) values(dbf,c);
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform set_fund_expense_tags(dbf,array['Meals']);
 perform set_config('request.jwt.claim.sub',r::text,true);
 req:=create_budget_request(dbf,'Requester',700,'Supplies');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 v:=save_workflow_voucher(null,dbf,req,'Requester',current_date,'[{"particulars":"Supplies","amount":700}]','none',null);
 perform release_voucher(v);
 perform set_config('request.jwt.claim.sub',r::text,true);
 liq:=create_liquidation(v);
 select filing_date into filing from liquidations where id=liq;
 perform save_liquidation(liq,'Ops',filing,jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'particulars','Supplies','amount',700,'no_receipt_reason','No receipt')),null);
 perform submit_liquidation(liq);
 perform set_config('request.jwt.claim.sub',c::text,true);
 select receipt_review_revision into rev from liquidations where id=liq;
 lines:=jsonb_build_array(jsonb_build_object('particulars','Supplies','amount',700,'supplier','Shop','tin','111','tag','Meals','expense_date',filing,'plate','N/A','receipt_number','OR-1','physical_checked',true,'receipt_path',''));
 perform save_custodian_receipts(liq,rev,lines);
 perform approve_liquidation_without_sheet(liq);
 rep:=create_replenishment(dbf);
 perform submit_replenishment(rep);
 perform set_config('request.jwt.claim.sub',acc::text,true);
 perform review_replenishment(rep,true,null);
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform approve_replenishment(rep,true,null);
 perform set_config('request.jwt.claim.sub',acc::text,true);

 -- the day cannot be in the future or before the replenishment was prepared
 begin perform close_replenishment_with_handover(rep,today+1,700,null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%cannot be in the future%','a future day is refused: '||coalesce(msg,'(accepted)');
 begin perform close_replenishment_with_handover(rep,today-30,700,null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%before this replenishment was prepared%','a day before it was prepared is refused: '||coalesce(msg,'(accepted)');
 begin perform close_replenishment_with_handover(rep,null,700,null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%day the cash was handed over%','a missing day is refused';

 -- an amount that is not the approved one needs an explanation
 begin perform close_replenishment_with_handover(rep,today,500,null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%different from the approved amount%','a different amount needs a note: '||coalesce(msg,'(accepted)');
 begin perform close_replenishment_with_handover(rep,today,0,'zero'); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%greater than zero%','a zero amount is refused';
 assert (select status::text from replenishments where id=rep)='approved','refusals closed nothing';
 assert (select handed_over_on is null and handed_over_amount is null from replenishments where id=rep),'refusals recorded nothing';

 -- the real day (before today: the cash went out earlier) and a different amount with its note
 perform close_replenishment_with_handover(rep,today,650,'PHP 50 kept for the bank fee');
 assert (select status::text from replenishments where id=rep)='closed','it closed';
 assert (select handed_over_on=today and handed_over_amount=650 and handover_note='PHP 50 kept for the bank fee' and paid_by=acc and paid_at is not null from replenishments where id=rep),'the day, the amount, the note and who pressed it are kept';

 -- not twice; and only accounting or an administrator
 begin perform close_replenishment_with_handover(rep,today,700,null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'cannot be recorded twice';
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform close_replenishment_with_handover(rep,today,700,null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'a custodian cannot record a handover';
 raise notice 'cash-handover-record: all checks passed';
end $$;
rollback;
