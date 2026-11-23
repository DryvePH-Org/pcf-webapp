-- Phase 63: any custodian of a fund, or an administrator, reviews a liquidation against the fund's workbook.
-- All fixtures roll back. Run only against an isolated database.
begin;
insert into auth.users(id,email) values
('99000000-0000-4000-8000-000000000001','owner@fw.invalid'),
('99000000-0000-4000-8000-000000000002','other@fw.invalid'),
('99000000-0000-4000-8000-000000000003','admin@fw.invalid'),
('99000000-0000-4000-8000-000000000004','stranger@fw.invalid');
insert into profiles(id,full_name,role) values
('99000000-0000-4000-8000-000000000001','Workbook Custodian','custodian'),
('99000000-0000-4000-8000-000000000002','Other Custodian','custodian'),
('99000000-0000-4000-8000-000000000003','Admin','admin'),
('99000000-0000-4000-8000-000000000004','Stranger Custodian','custodian');
insert into funds(id,name,amount,per_txn_limit,approval_threshold,custodian_self_approval) values
('99000000-0000-4000-8000-000000000010','Workbook fund',100000,50000,30000,true);
insert into fund_custodians(fund_id,custodian_id) values
('99000000-0000-4000-8000-000000000010','99000000-0000-4000-8000-000000000001'),
('99000000-0000-4000-8000-000000000010','99000000-0000-4000-8000-000000000002');
-- a workbook assigned to the first custodian
update sheet_workbooks set enabled=true,custodian_id='99000000-0000-4000-8000-000000000001',fund_id='99000000-0000-4000-8000-000000000010',
  catalog='[{"sheetId":1,"title":"T","expenseTags":["MEALS","FUEL"]}]'::jsonb,active_sheet_id=1 where id='selling';

do $$
declare tags text[];
begin
 -- the assigned custodian, as before
 perform set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000001',true);
 select list_custodian_tags('99000000-0000-4000-8000-000000000010') into tags;
 assert tags @> array['MEALS','FUEL'],'the assigned custodian sees the tags';
 -- another custodian of the fund, and an administrator, now see the same tags
 perform set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000002',true);
 select list_custodian_tags('99000000-0000-4000-8000-000000000010') into tags;
 assert tags @> array['MEALS','FUEL'],'another custodian of the fund sees the tags';
 perform set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000003',true);
 select list_custodian_tags('99000000-0000-4000-8000-000000000010') into tags;
 assert tags @> array['MEALS','FUEL'],'an administrator sees the tags';
 -- a custodian who is not assigned to the fund is still refused
 perform set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000004',true);
 begin
   perform list_custodian_tags('99000000-0000-4000-8000-000000000010');
   assert false,'a stranger must not read the fund''s workbook tags';
 exception when others then
   assert sqlerrm not like 'a stranger%','a stranger is refused';
 end;
 -- the approval check lets those two roles through, and still names the fund access rule
 assert pg_get_functiondef('public.approve_liquidation_with_sheet_legacy(uuid)'::regprocedure) like '%app_role() in (''admin'',''custodian'') and public.can_access_fund(w.fund_id)%','the approval check allows fund reviewers';
end $$;
rollback;
