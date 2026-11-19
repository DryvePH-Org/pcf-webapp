-- Phase 52: a fund that keeps its ledger in the database only. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('96100000-0000-4000-8000-000000000001','custodian@do.invalid'),
('96100000-0000-4000-8000-000000000002','requester@do.invalid'),
('96100000-0000-4000-8000-000000000003','admin@do.invalid'),
('96100000-0000-4000-8000-000000000004','approver@do.invalid');
insert into profiles(id,full_name,role) values
('96100000-0000-4000-8000-000000000001','Custodian','custodian'),
('96100000-0000-4000-8000-000000000002','Requester','requester'),
('96100000-0000-4000-8000-000000000003','Admin','admin'),
('96100000-0000-4000-8000-000000000004','Approver','approver');

do $$
declare c constant uuid:='96100000-0000-4000-8000-000000000001'; r constant uuid:='96100000-0000-4000-8000-000000000002';
 adm constant uuid:='96100000-0000-4000-8000-000000000003'; a constant uuid:='96100000-0000-4000-8000-000000000004';
 dbf uuid:=gen_random_uuid(); shf uuid:=gen_random_uuid(); req uuid; v uuid; liq uuid; filing date; line uuid:=gen_random_uuid();
 rev int; lines jsonb; msg text; tags text[]; rid1 uuid:=gen_random_uuid(); rid2 uuid:=gen_random_uuid(); stale uuid:=gen_random_uuid(); fresh uuid:=gen_random_uuid();
 items jsonb;
begin
 assert (select count(*) from funds where not sheet_ledger)=0,'every existing fund still writes to its sheet';
 insert into funds(id,name,amount,per_txn_limit,approval_threshold,sheet_ledger) values(dbf,'Database fund',100000,50000,3000,false),(shf,'Sheet fund',100000,50000,3000,true);
 insert into fund_custodians(fund_id,custodian_id) values(dbf,c),(shf,c);

 -- Tags: only an administrator sets them, only for a database-only fund, cleaned and kept in order.
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform set_fund_expense_tags(dbf,array['Meals']); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'a custodian cannot set tags';
 perform set_config('request.jwt.claim.sub',adm::text,true);
 begin perform set_fund_expense_tags(shf,array['Meals']); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%database-only%','a sheet fund keeps its sheet''s list: '||coalesce(msg,'(accepted)');
 perform set_fund_expense_tags(dbf,array['  Meals ','Fuel','Meals','','Parking']);
 perform set_config('request.jwt.claim.sub',c::text,true);
 tags:=list_custodian_tags(dbf);
 assert tags=array['Meals','Fuel','Parking'],'the custodian sees the cleaned list in order: '||array_to_string(tags,'|');

 -- A database-only fund cannot be connected to a sheet.
 begin update sheet_workbooks set fund_id=dbf,enabled=true where id='dryve'; msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%database only%','no sheet for a database-only fund: '||coalesce(msg,'(accepted)');

 -- The whole flow without a sheet: request, voucher, liquidation, receipt review, approval.
 perform set_config('request.jwt.claim.sub',r::text,true);
 req:=create_budget_request(dbf,'Requester',2000,'Supplies');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 v:=save_workflow_voucher(null,dbf,req,'Requester',current_date,'[{"particulars":"Supplies","amount":2000}]','none',null);
 perform release_voucher(v);
 perform set_config('request.jwt.claim.sub',r::text,true);
 liq:=create_liquidation(v);
 select filing_date into filing from liquidations where id=liq;
 items:=jsonb_build_array(jsonb_build_object('id',line,'particulars','Supplies','amount',2000,'no_receipt_reason','No receipt'));
 perform save_liquidation(liq,'Ops',filing,items,null);
 perform submit_liquidation(liq);

 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform approve_liquidation_without_sheet(liq); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%receipt review first%','approval waits for the receipt review: '||coalesce(msg,'(accepted)');
 begin perform review_liquidation(liq,true,null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'the old approve-without-preview door stays shut';
 select receipt_review_revision into rev from liquidations where id=liq;
 lines:=jsonb_build_array(jsonb_build_object('particulars','Supplies','amount',2000,'supplier','N/A','tin','N/A','tag','Meals','expense_date',filing,'plate','N/A','receipt_number','','physical_checked',true,'receipt_path',''));
 perform save_custodian_receipts(liq,rev,lines);
 perform set_config('request.jwt.claim.sub',r::text,true);
 begin perform approve_liquidation_without_sheet(liq); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'the requester cannot approve their own liquidation';
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform approve_liquidation_without_sheet(liq);
 assert (select status from liquidations where id=liq)='approved','the custodian approved it with no sheet';
 assert not exists(select 1 from sheet_jobs where liquidation_id=liq) and not exists(select 1 from grokbot_operations where liquidation_id=liq),'nothing was queued for a sheet';

 -- A sheet fund cannot use that door.
 perform set_config('request.jwt.claim.sub',r::text,true);
 req:=create_budget_request(shf,'Requester',1500,'Sheet fund');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 v:=save_workflow_voucher(null,shf,req,'Requester',current_date,'[{"particulars":"Supplies","amount":1500}]','none',null);
 perform release_voucher(v);
 perform set_config('request.jwt.claim.sub',r::text,true);
 liq:=create_liquidation(v);
 select filing_date into filing from liquidations where id=liq;
 perform save_liquidation(liq,'Ops',filing,jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'particulars','Supplies','amount',1500,'no_receipt_reason','No receipt')),null);
 perform submit_liquidation(liq);
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform approve_liquidation_without_sheet(liq); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%writes to a Google Sheet%','a sheet fund is refused: '||coalesce(msg,'(accepted)');

 -- The way a fund keeps its ledger is fixed once it has vouchers.
 perform set_config('request.jwt.claim.sub',adm::text,true);
 begin update funds set sheet_ledger=true where id=dbf; msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%already has vouchers%','it cannot be flipped: '||coalesce(msg,'(accepted)');

 -- Replenishing: a database-only fund queues no sheet marker; a sheet fund still does.
 perform set_config('request.jwt.claim.sub',c::text,true);
 insert into replenishments(id,fund_id,request_no,status,total,requested_by) values(rid1,dbf,'RPL-DO-1','draft',1000,c),(rid2,shf,'RPL-DO-2','draft',1000,c);
 update replenishments set status='approved',reviewed_by=adm,reviewed_at=now(),approver_id=a,approver_approved_at=now() where id in (rid1,rid2);
 assert not exists(select 1 from sheet_rollovers where replenishment_id=rid1),'no sheet marker for the database-only fund';
 assert exists(select 1 from sheet_rollovers where replenishment_id=rid2),'a sheet fund still queues its marker';

 -- A refresh Grokbot never answered is released by itself, so the next one can run.
 insert into grokbot_operations(id,kind,status,spreadsheet_id,sheet_id,callback_hash,payload,expires_at,created_at,updated_at)
 values(stale,'workbook_refresh','running','1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk',1042918180,repeat('a',64),'{}',now()+interval '1 hour',now()-interval '30 minutes',now()-interval '20 minutes'),
       (fresh,'workbook_refresh','queued','1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk',1042918180,repeat('b',64),'{}',now()+interval '1 hour',now(),now());
 perform claim_grokbot_dispatch();
 assert (select status from grokbot_operations where id=stale)='failed','the unanswered refresh was released';
 assert (select status from grokbot_operations where id=fresh)='running','the next refresh went out';
 raise notice 'database-only-fund: all checks passed';
end $$;
rollback;
