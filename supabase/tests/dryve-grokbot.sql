-- Phase 42: a second Grokbot sheet (DRYVE). All fixtures roll back. Run only against an isolated database.
begin;
insert into auth.users(id,email) values
('96000000-0000-4000-8000-000000000001','custodian@dg.invalid'),
('96000000-0000-4000-8000-000000000002','accounting@dg.invalid'),
('96000000-0000-4000-8000-000000000003','approver@dg.invalid'),
('96000000-0000-4000-8000-000000000004','admin@dg.invalid');
insert into profiles(id,full_name,role) values
('96000000-0000-4000-8000-000000000001','Dryve Custodian','custodian'),
('96000000-0000-4000-8000-000000000002','Accounting','accounting'),
('96000000-0000-4000-8000-000000000003','Approver','approver'),
('96000000-0000-4000-8000-000000000004','Admin','admin');
insert into funds(id,name,amount,per_txn_limit,approval_threshold,custodian_self_approval) values
('96000000-0000-4000-8000-000000000010','Dryve fund',100000,50000,30000,true);
insert into fund_custodians(fund_id,custodian_id) values
('96000000-0000-4000-8000-000000000010','96000000-0000-4000-8000-000000000001');

do $$
declare op1 uuid:=gen_random_uuid(); op2 uuid:=gen_random_uuid(); op3 uuid:=gen_random_uuid(); op4 uuid:=gen_random_uuid();
 refused boolean; n int; claimed uuid; tok uuid; rid uuid:=gen_random_uuid(); req uuid; voucher uuid; liq uuid;
 job jsonb; title text;
begin
 -- 1. The allowlist and the seeded DRYVE workbook.
 assert (select count(*) from grokbot_targets())=2,'two allowed sheets';
 assert grokbot_destination_ok('1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ',1251133408),'DRYVE is allowed';
 assert not grokbot_destination_ok('1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ',1042918180),'a mixed-up pair is refused';
 assert (select spreadsheet_id from sheet_workbooks where id='dryve')='1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ','dryve points at the new sheet';
 assert (select replenishment_sequence from sheet_workbooks where id='dryve')=13,'next marker is #14';
 assert (select jsonb_array_length(catalog->0->'expenseTags') from sheet_workbooks where id='dryve')=30,'30 expense types seeded';
 assert (select enabled from sheet_workbooks where id='dryve')=false,'disabled until assigned';

 -- 2. An operation can only target an allowed sheet.
 insert into grokbot_operations(id,kind,spreadsheet_id,sheet_id,callback_hash,payload,expires_at,created_at)
   values(op1,'integration_test','1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk',1042918180,repeat('a',64),'{}',now()+interval '2 hours',now()-interval '3 minutes');
 insert into grokbot_operations(id,kind,spreadsheet_id,sheet_id,callback_hash,payload,expires_at,created_at)
   values(op2,'integration_test','1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ',1251133408,repeat('b',64),'{}',now()+interval '2 hours',now()-interval '2 minutes');
 refused:=false;
 begin insert into grokbot_operations(id,kind,spreadsheet_id,sheet_id,callback_hash,payload,expires_at)
   values(gen_random_uuid(),'integration_test','1yhst5xpEQ41cAEc89-GVd-QXpUlshpckfzAk2vbxR9w',1,repeat('c',64),'{}',now()+interval '2 hours');
 exception when others then refused:=true; end;
 assert refused,'an unknown sheet is refused';

 -- 3. Dispatch: each sheet runs one at a time, different sheets side by side.
 select id into claimed from claim_grokbot_dispatch();
 assert claimed=op1,'the oldest queued operation runs first';
 select id into claimed from claim_grokbot_dispatch();
 assert claimed=op2,'the other sheet runs alongside it';
 insert into grokbot_operations(id,kind,spreadsheet_id,sheet_id,callback_hash,payload,expires_at,created_at)
   values(op3,'integration_test','1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ',1251133408,repeat('d',64),'{}',now()+interval '2 hours',now()-interval '1 minute');
 assert not exists(select 1 from claim_grokbot_dispatch()),'a sheet that is already running waits';
 update grokbot_operations set status='completed' where id=op2;
 select id into claimed from claim_grokbot_dispatch();
 assert claimed=op3,'it runs once the sheet is free';

 -- 4. The Buying snapshot path still works, and the new per-book one works for DRYVE.
 update sheet_workbooks set enabled=true,custodian_id='96000000-0000-4000-8000-000000000001',fund_id='96000000-0000-4000-8000-000000000010' where id='dryve';
 tok:=claim_sheet_refresh('dryve');
 assert tok is not null,'a refresh lease is granted';
 perform apply_grokbot_book_snapshot('dryve','[{"source_row":8,"expense_date":"2026-11-12","voucher":"1728","category":"MEALS","particulars":"Test lunch","person":"JUSTINE","supplier":"JOLLIBEE","plate":"N/A","receipt_number":"","company":"DRYVE","amount":250}]'::jsonb,
   '{"sheetId":1251133408,"title":"DRYVE PCF - NOV TO DEC 2026","replenishmentNumber":13,"expenseTags":["MEALS"]}'::jsonb,tok);
 assert (select count(*) from sheet_expenses where book_id='dryve' and sheet_id=1251133408)=1,'the snapshot rows are saved';
 assert (select sheet_name from sheet_expenses where book_id='dryve')='DRYVE PCF - NOV TO DEC 2026','with the sheet title';
 assert (select replenishment_sequence from sheet_workbooks where id='dryve')=13,'the sequence follows the sheet';
 tok:=null;
 update sheet_workbooks set last_synced_at=null,refresh_until=null where id='dryve';
 tok:=claim_sheet_refresh('dryve');
 refused:=false;
 begin perform apply_grokbot_book_snapshot('dryve','[]'::jsonb,'{"sheetId":1042918180}'::jsonb,tok); exception when others then refused:=true; end;
 assert refused,'a snapshot of another tab is refused';

 -- 5. The assignment guard.
 refused:=false;
 begin update sheet_workbooks set active_sheet_id=1 where id='dryve'; exception when others then refused:=true; end;
 assert refused,'DRYVE cannot be switched to another worksheet while enabled';

 -- 6. A replenishment marker for DRYVE (#14 after the sheet's #13).
 perform set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
 insert into replenishments(id,fund_id,request_no,status,total,requested_by)
   values(rid,'96000000-0000-4000-8000-000000000010','RPL-DG-1','draft',1000,'96000000-0000-4000-8000-000000000001');
 update replenishments set status='approved',reviewed_by='96000000-0000-4000-8000-000000000002',reviewed_at=now(),
   approver_id='96000000-0000-4000-8000-000000000003',approver_approved_at=now() where id=rid;
 assert exists(select 1 from sheet_rollovers where replenishment_id=rid and book_id='dryve'),'the rollover is tied to the DRYVE workbook';
 perform queue_grokbot_replenishment(rid,op4,repeat('e',64),'dryve');
 select o.payload into job from grokbot_operations o where o.id=op4;
 assert job->'target'->>'sheet_title'='DRYVE PCF - NOV TO DEC 2026','the marker job targets the DRYVE tab';
 assert (job->>'replenishment_number')::int=14 and (job->>'expected_previous_replenishment_number')::int=13,'it continues after #13';
 assert (select spreadsheet_id from grokbot_operations where id=op4)='1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ','on the DRYVE spreadsheet';
 refused:=false;
 begin perform queue_grokbot_replenishment(rid,gen_random_uuid(),repeat('f',64),'buying'); exception when others then refused:=true; end;
 assert refused or (select count(*) from grokbot_operations where replenishment_id=rid)=1,'one job per replenishment';

 -- 7. A completed marker job records the real tab in the rollover.
 update grokbot_operations set status='completed' where id=op3;
 update grokbot_operations set status='running' where id=op4;
 perform claim_grokbot_runner(op4,'96000000-0000-4000-8000-0000000000aa');
 perform record_grokbot_result(op4,'96000000-0000-4000-8000-0000000000aa','completed','{}'::jsonb,'');
 select target_name into title from sheet_rollovers where replenishment_id=rid;
 assert title='DRYVE PCF - NOV TO DEC 2026','the rollover names the DRYVE tab, found '||coalesce(title,'null');
 assert (select target_sheet_id from sheet_rollovers where replenishment_id=rid)=1251133408,'and its tab id';

 -- 8. The Company chosen in the custodian's review is saved.
 req:=create_budget_request('96000000-0000-4000-8000-000000000010','Dryve Custodian',1500,'Dryve supplies');
 perform review_budget_request(req,true,null);
 voucher:=save_workflow_voucher(null,'96000000-0000-4000-8000-000000000010',req,'Dryve Custodian',current_date,
   '[{"particulars":"Supplies","amount":1500}]','none',null);
 update vouchers set status='released', released_at=now() where id=voucher;
 liq:=create_liquidation(voucher);
 perform save_liquidation(liq,'Ops',(select filing_date from liquidations where id=liq),
   '[{"id":"96000000-0000-4000-8000-0000000000a1","particulars":"Supplies","amount":1000,"no_receipt_reason":"No receipt"}]'::jsonb,null);
 perform submit_liquidation(liq);
 perform save_custodian_receipts(liq,(select receipt_review_revision from liquidations where id=liq),
   '[{"particulars":"Supplies","amount":1000,"supplier":"N/A","tin":"N/A","tag":"MEALS","expense_date":"2026-11-12","plate":"N/A","receipt_number":"","company":"VENTA","receipt_path":"","physical_checked":true}]'::jsonb);
 assert (select company from liquidation_receipt_lines where liquidation_id=liq)='VENTA','the company is saved on the receipt line';
 perform save_custodian_receipts(liq,(select receipt_review_revision from liquidations where id=liq),
   '[{"particulars":"Supplies","amount":1000,"supplier":"N/A","tin":"N/A","tag":"MEALS","expense_date":"2026-11-12","plate":"N/A","receipt_number":"","physical_checked":true}]'::jsonb);
 assert (select company from liquidation_receipt_lines where liquidation_id=liq)='','a line without a company stays blank (Buying)';
end $$;
rollback;
