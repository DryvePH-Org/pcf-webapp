-- Phase 60: a third Grokbot sheet (Operations Parts & Repairs). All fixtures roll back. Run only against an isolated database.
begin;
insert into auth.users(id,email) values
('97000000-0000-4000-8000-000000000001','custodian@og.invalid'),
('97000000-0000-4000-8000-000000000002','accounting@og.invalid'),
('97000000-0000-4000-8000-000000000003','approver@og.invalid');
insert into profiles(id,full_name,role) values
('97000000-0000-4000-8000-000000000001','Ops Custodian','custodian'),
('97000000-0000-4000-8000-000000000002','Accounting','accounting'),
('97000000-0000-4000-8000-000000000003','Approver','approver');
insert into funds(id,name,amount,per_txn_limit,approval_threshold,custodian_self_approval) values
('97000000-0000-4000-8000-000000000010','Operations fund',100000,50000,30000,true);
insert into fund_custodians(fund_id,custodian_id) values
('97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000001');

do $$
declare sid text; gid int; op1 uuid:=gen_random_uuid(); op2 uuid:=gen_random_uuid(); claimed uuid; tok uuid;
 refused boolean; rid uuid:=gen_random_uuid(); job jsonb;
begin
 select spreadsheet_id,sheet_id into sid,gid from grokbot_targets() where book='operations';
 assert sid is not null,'operations is an allowed sheet';
 assert grokbot_destination_ok(sid,gid),'the Operations tab is allowed';
 assert not grokbot_destination_ok(sid,gid+1),'another tab of it is refused';
 assert (select spreadsheet_id from sheet_workbooks where id='operations')=sid,'the workbook points at the sheet';
 assert (select replenishment_sequence from sheet_workbooks where id='operations')=0,'next marker is #01';
 assert (select enabled from sheet_workbooks where id='operations')=false,'disabled until assigned';
 assert (select jsonb_array_length(catalog->0->'expenseTags') from sheet_workbooks where id='operations')=39,'39 expense tags seeded';

 -- Operations and Buying run side by side; one at a time per sheet.
 insert into grokbot_operations(id,kind,spreadsheet_id,sheet_id,callback_hash,payload,expires_at,created_at)
   values(op1,'integration_test',sid,gid,repeat('a',64),'{}',now()+interval '2 hours',now()-interval '2 minutes');
 select id into claimed from claim_grokbot_dispatch();
 assert claimed=op1,'the Operations job runs';
 insert into grokbot_operations(id,kind,spreadsheet_id,sheet_id,callback_hash,payload,expires_at,created_at)
   values(op2,'integration_test',sid,gid,repeat('b',64),'{}',now()+interval '2 hours',now()-interval '1 minute');
 assert not exists(select 1 from claim_grokbot_dispatch()),'a second job on the same sheet waits';

 -- Assignment guard: the worksheet cannot be switched while enabled.
 update sheet_workbooks set enabled=true,custodian_id='97000000-0000-4000-8000-000000000001',fund_id='97000000-0000-4000-8000-000000000010' where id='operations';
 refused:=false;
 begin update sheet_workbooks set active_sheet_id=1 where id='operations'; exception when others then refused:=true; end;
 assert refused,'Operations cannot be switched to another worksheet while enabled';

 -- A refresh snapshot is saved against the Operations book.
 tok:=claim_sheet_refresh('operations');
 assert tok is not null,'a refresh lease is granted';
 perform apply_grokbot_book_snapshot('operations','[]'::jsonb,
   jsonb_build_object('sheetId',gid,'title','PCF REPLENISHMENT #1 (NEW)','replenishmentNumber',0,'expenseTags',jsonb_build_array('CE - TIRES')),tok);
 assert (select replenishment_sequence from sheet_workbooks where id='operations')=0,'the sequence follows the sheet';
end $$;
rollback;
