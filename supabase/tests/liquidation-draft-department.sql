-- Phase 51: a liquidation draft can be saved without a department; submitting needs one. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('97000000-0000-4000-8000-000000000001','custodian@ld.invalid'),
('97000000-0000-4000-8000-000000000002','requester@ld.invalid');
insert into profiles(id,full_name,role) values
('97000000-0000-4000-8000-000000000001','Custodian','custodian'),
('97000000-0000-4000-8000-000000000002','Requester','requester');

do $$
declare c constant uuid:='97000000-0000-4000-8000-000000000001'; r constant uuid:='97000000-0000-4000-8000-000000000002';
 fund uuid:=gen_random_uuid(); req uuid; v uuid; liq uuid; filing date; line uuid:=gen_random_uuid(); msg text;
 items jsonb;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold) values(fund,'Draft fund',100000,50000,3000);
 insert into fund_custodians(fund_id,custodian_id) values(fund,c);
 perform set_config('request.jwt.claim.sub',r::text,true);
 req:=create_budget_request(fund,'Requester',2000,'Supplies');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 v:=save_workflow_voucher(null,fund,req,'Requester',current_date,'[{"particulars":"Supplies","amount":2000}]','none',null);
 perform release_voucher(v);
 perform set_config('request.jwt.claim.sub',r::text,true);
 liq:=create_liquidation(v);
 select filing_date into filing from liquidations where id=liq;
 items:=jsonb_build_array(jsonb_build_object('id',line,'particulars','Supplies','amount',2000,'no_receipt_reason','No receipt'));

 -- A draft saves with no department and keeps what was typed.
 perform save_liquidation(liq,'',filing,items,null);
 assert (select department from liquidations where id=liq)='','the draft was saved with an empty department';
 assert (select total_spent from liquidations where id=liq)=2000,'the expense lines were kept';
 assert (select status from liquidations where id=liq)='draft','it is still a draft';

 -- Submitting still needs the department.
 begin perform submit_liquidation(liq); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%Department is required%','submit is refused without a department: '||coalesce(msg,'(accepted)');
 assert (select status from liquidations where id=liq)='draft','it stays a draft';

 -- With a department it goes through.
 perform save_liquidation(liq,'Operations',filing,items,null);
 perform submit_liquidation(liq);
 assert (select status from liquidations where id=liq)='submitted' and (select department from liquidations where id=liq)='Operations','it submits once the department is filled in';
 raise notice 'liquidation-draft-department: all checks passed';
end $$;
rollback;
