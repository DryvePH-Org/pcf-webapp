-- Phase 38 security fixes. All fixtures roll back. Run only against an isolated database.
begin;
insert into auth.users(id,email) values
('93000000-0000-4000-8000-000000000001','requester@security.invalid'),
('93000000-0000-4000-8000-000000000002','custodian-a@security.invalid'),
('93000000-0000-4000-8000-000000000003','custodian-b@security.invalid');
insert into profiles(id,full_name,role) values
('93000000-0000-4000-8000-000000000001','Security Requester','requester'),
('93000000-0000-4000-8000-000000000002','Security Custodian A','custodian'),
('93000000-0000-4000-8000-000000000003','Security Custodian B','custodian');
insert into funds(id,name,amount,per_txn_limit,approval_threshold) values
('93000000-0000-4000-8000-000000000010','Security fund A',10000,5000,3000),
('93000000-0000-4000-8000-000000000011','Security fund B',10000,5000,3000);
insert into fund_custodians(fund_id,custodian_id) values
('93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000002'),
('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000003');

do $$
declare voucher uuid; visible int; blocked boolean;
begin
 -- Grants
 assert not has_function_privilege('authenticated','public.create_voucher(uuid,text,text,numeric,uuid,date,text,text)','execute'),
   'the legacy single-line RPC is no longer callable';
 assert has_function_privilege('authenticated','public.save_workflow_voucher(uuid,uuid,uuid,text,date,jsonb,text,text)','execute'),
   'the workflow voucher RPC still works';
 assert not has_table_privilege('authenticated','public.sheet_expense_reporting_v','INSERT')
   and not has_table_privilege('authenticated','public.replenishment_eligibility_v','DELETE'),
   'reporting views are read-only';

 -- Custodian A prepares a direct voucher in fund A.
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000002',true);
 voucher:=save_workflow_voucher(null,'93000000-0000-4000-8000-000000000010',null,'Hardware store',current_date,
   '[{"particulars":"Padlocks","amount":240}]','none',null);

 -- Voucher lines follow the voucher's own visibility.
 set local role authenticated;
 select count(*) into visible from voucher_items where voucher_id=voucher;
 assert visible=1,'the preparer sees the line';
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000003',true);
 select count(*) into visible from voucher_items where voucher_id=voucher;
 assert visible=0,'a custodian of another fund cannot see the line';
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
 select count(*) into visible from voucher_items;
 assert visible=0,'a requester cannot list voucher lines';

 -- Photo paths must stay inside the voucher's folder, even on a direct update.
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000002',true);
 blocked:=false;
 begin
   update vouchers set receipt_path='93000000-0000-4000-8000-000000000011/other/receipt.jpg' where id=voucher;
 exception when others then blocked:=true;
 end;
 assert blocked,'a receipt path from another fund is refused';
 blocked:=false;
 begin
   update vouchers set paper_voucher_path='../'||voucher::text||'/paper.jpg' where id=voucher;
 exception when others then blocked:=true;
 end;
 assert blocked,'a paper photo path outside the voucher folder is refused';
 update vouchers set receipt_path='93000000-0000-4000-8000-000000000010/'||voucher::text||'/receipt.jpg' where id=voucher;
 assert (select receipt_path like '%/receipt.jpg' from vouchers where id=voucher),'the voucher''s own folder is accepted';
 reset role;
end $$;
rollback;
